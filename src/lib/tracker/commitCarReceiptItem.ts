// Place at: src/lib/tracker/commitCarReceiptItem.ts
//
// Car equivalent of commitReceiptItem.ts - same mileage-estimation,
// duplicate-detection, plate/vehicle-mismatch, and tank-plausibility
// logic, against the Car* doc types instead. commitReceiptItem.ts
// itself is deliberately left untouched (see the ADR's sister-schema
// principle) - this is an independent, self-contained twin, matching
// every other car/bike file pair built so far.
//
// Two deliberate scope cuts versus the motorcycle version, both
// additive-later-safe:
// - No reminder auto-creation. Deferred to the phase that builds the
//   car reminders route/UI - creating a reminder nobody can yet see or
//   manage would be dead weight, not a head start.
// - No kWh/EV-charging support yet, even though CarFuelLogDoc already
//   has a kwh field for it. Gemini extraction only ever returns a
//   litres reading (see receiptParse.ts), so a "fuel" item for a fully
//   electric car will fall out via the existing unreadable-litres skip
//   in parseReceiptFile - same fail-safe (skip, don't fabricate) as
//   every other unreadable value in this pipeline. Real EV charging-
//   receipt support (its own prompt fields, its own skip rule) is real
//   work worth doing once there's an actual car dashboard to test it
//   against, not before.
import { getCarServiceRecords, createCarServiceRecord } from "@/lib/tracker/carServiceRecord";
import { getCarFuelLogs, createCarFuelLog } from "@/lib/tracker/carFuelLog";
import { getCarMods, createCarMod } from "@/lib/tracker/carMod";
import { getCarBills, createCarBill } from "@/lib/tracker/carBill";
import { estimateMileage, estimateFuelMileageFromLitres, applyKnownBounds, type MileagePoint } from "@/lib/tracker/mileageEstimate";
import { computeActualMPG } from "@/lib/tracker/mpgCalc";
import { guessCarJobType, guessCarModCategory, guessCarBillType } from "@/lib/tracker/carGuessCategory";
import { CAR_JOB_LABELS } from "@/lib/tracker/carJobTypes";
import { CAR_BILL_LABELS } from "@/lib/tracker/carBillTypes";
import { buildAiDescription } from "@/lib/tracker/aiDescription";
import { findPossibleDuplicate } from "@/lib/tracker/duplicateCheck";
import { checkMileageConsistency, describeMileageCheck, type HistoryPoint } from "@/lib/tracker/mileageCheck";
import { guessFilledToFull } from "@/lib/tracker/tankGuess";
import { checkFullTankPlausibility, describeImplausibleFill } from "@/lib/tracker/fuelPlausibility";
import { normalizePlate } from "@/lib/tracker/reportAccess";
import { reestimateCarFuelMileage } from "@/lib/tracker/reestimateCarFuelMileage";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";
import type { CarDoc } from "@/lib/tracker/car";
import type { PlateMismatch, VehicleMismatch, ReviewQueueEntry } from "@/lib/tracker/commitReceiptItem";

// Every registration this car has ever held - mirrors reportAccess.ts's
// allKnownPlates exactly, kept as a small local copy rather than adding
// a CarDoc overload there, matching how every other car file avoids
// runtime imports from its bike counterpart (or vice versa).
function allKnownCarPlates(car: CarDoc): string[] {
  const plates = new Set<string>();
  if (car.originalRegistration) plates.add(normalizePlate(car.originalRegistration));
  for (const change of car.registrationChanges ?? []) plates.add(normalizePlate(change.plate));
  return [...plates];
}

// Loose match on purpose - see commitReceiptItem.ts's own copy of this
// pair for the full reasoning (receipts render the same make in enough
// different ways that a strict equality check would false-flag
// constantly).
function normalizeVehicleName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function vehicleNamesMatch(a: string, b: string): boolean {
  const na = normalizeVehicleName(a);
  const nb = normalizeVehicleName(b);
  if (!na || !nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function withAiCaveat(description: string, forceReview: boolean, aiLowConfidence: boolean): string {
  if (forceReview) return `${description} (currency could not be auto-converted - please check the amount)`;
  if (aiLowConfidence) return `${description} (AI wasn't fully confident reading this receipt - please double-check the details)`;
  return description;
}

function aiCaveatOnly(forceReview: boolean, aiLowConfidence: boolean): string | null {
  if (forceReview) return "Currency could not be auto-converted - please check the amount";
  if (aiLowConfidence) return "AI wasn't fully confident reading this receipt - please double-check the details";
  return null;
}

// Best-effort, non-blocking - same reasoning as commitReceiptItem.ts's
// reestimateNearbyFuelLogs: only ever called when mileageConfidence
// ended up undefined (the printed mileage was trusted directly, a new
// genuine anchor), and a failure here must never undo an otherwise-
// successful commit.
async function reestimateNearbyCarFuelLogs(email: string, car: CarDoc) {
  try {
    await reestimateCarFuelMileage(email, car);
  } catch (err) {
    console.error("Car fuel mileage re-estimation after receipt commit failed:", err);
  }
}

export async function commitCarReceiptItem(
  email: string,
  car: CarDoc,
  item: ParsedReceiptItem,
  batchHints: { date: string; mileage: number; batchIndex?: number; category?: "service" | "fuel" | "mods" | "mot"; litres?: number }[] = [],
  boundsOnlyHints: { date: string; mileage: number; batchIndex?: number }[] = []
): Promise<ReviewQueueEntry> {
  const { category, date, costGbp, description, litres, mileageOnReceipt, registrationOnReceipt, merchantName, address, city, vehicleMakeOnReceipt, vehicleModelOnReceipt, attachment, currencyConversion, forceReview, aiLowConfidence } = item;

  // The very first thing checked, before anything category- or
  // mileage-specific: does this receipt even claim to be for THIS car?
  const plateMismatch: PlateMismatch | null =
    registrationOnReceipt && !allKnownCarPlates(car).includes(normalizePlate(registrationOnReceipt))
      ? { registrationOnReceipt }
      : null;

  const vehicleMismatch: VehicleMismatch | null =
    vehicleMakeOnReceipt && !vehicleNamesMatch(vehicleMakeOnReceipt, car.make)
      ? { makeOnReceipt: vehicleMakeOnReceipt, modelOnReceipt: vehicleModelOnReceipt }
      : null;

  const [records, fuelLogs, mods, bills] = await Promise.all([
    getCarServiceRecords(email, car.id),
    getCarFuelLogs(email, car.id),
    getCarMods(email, car.id),
    getCarBills(email, car.id),
  ]);
  const serviceCandidates = records.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage, cost: r.cost, description: r.notes || (CAR_JOB_LABELS[r.jobType] ?? r.jobType) }));
  const fuelCandidates = fuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage, cost: f.cost, description: typeof f.litres === "number" ? `${f.litres.toFixed(1)}L fill-up` : `${(f.kwh ?? 0).toFixed(1)}kWh charge` }));
  const modCandidates = mods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage, cost: m.cost, description: m.name }));
  const billCandidates = bills.map((b) => ({ id: b.id, date: b.date, cost: b.cost, description: b.notes || (CAR_BILL_LABELS[b.billType] ?? b.billType) }));

  const isTrustworthy = (confidence: "interpolated" | "estimated" | "confirmed" | undefined) => !confidence || confidence === "confirmed";
  const trustedMileagePoints: HistoryPoint[] = [
    ...records.filter((r) => isTrustworthy(r.mileageConfidence)).map((r) => ({ id: r.id, category: "service" as const, date: r.date, mileage: r.mileage })),
    ...fuelLogs.filter((f) => isTrustworthy(f.mileageConfidence)).map((f) => ({ id: f.id, category: "fuel" as const, date: f.date, mileage: f.mileage })),
    ...mods.filter((m) => isTrustworthy(m.mileageConfidence)).map((m) => ({ id: m.id, category: "mods" as const, date: m.date, mileage: m.mileage })),
    ...bills.filter((b) => b.billType === "mot-test" && b.mileage != null).map((b) => ({ id: b.id, category: "mot" as const, date: b.date, mileage: b.mileage as number })),
    ...batchHints,
  ];
  const trustedMileagePointsForEstimate: MileagePoint[] = trustedMileagePoints.map((p) => ({ date: p.date, mileage: p.mileage }));
  const allMileagePoints: HistoryPoint[] = [
    ...records.map((r) => ({ id: r.id, category: "service" as const, date: r.date, mileage: r.mileage })),
    ...fuelLogs.map((f) => ({ id: f.id, category: "fuel" as const, date: f.date, mileage: f.mileage })),
    ...mods.map((m) => ({ id: m.id, category: "mods" as const, date: m.date, mileage: m.mileage })),
    ...bills.filter((b) => b.billType === "mot-test" && b.mileage != null).map((b) => ({ id: b.id, category: "mot" as const, date: b.date, mileage: b.mileage as number })),
    ...batchHints,
    ...boundsOnlyHints,
  ];
  const allPointsForBounds: MileagePoint[] = allMileagePoints.map((p) => ({ date: p.date, mileage: p.mileage }));

  let mileage: number | undefined;
  let mileageConfidence: "interpolated" | "estimated" | undefined;
  let mileageWarning: string | undefined;
  let mileageNeedsManualEntry = false;
  let conflictReferenceId: string | undefined;
  let conflictReferenceCategory: "service" | "fuel" | "mods" | "mot" | undefined;
  let conflictReferenceBatchIndex: number | undefined;

  // CarDoc carries no tankCapacityLitres field (see the ADR - out of
  // scope for this build) - undefined here behaves exactly like a bike
  // that never had a tank size set, which guessFilledToFull already
  // handles via its own heuristic fallback.
  const filledToFullGuess = category === "fuel" ? guessFilledToFull(litres ?? 0, undefined) : false;

  function applyGenericMileageEstimate(conflictWarning?: string) {
    const estimate = estimateMileage(
      date,
      trustedMileagePointsForEstimate,
      {
        startingMileage: car.startingMileage,
        currentMileage: car.currentMileage,
        dateAdded: car.dateAdded,
      },
      allPointsForBounds
    );
    mileage = estimate.mileage;
    mileageConfidence = estimate.confidence;
    mileageWarning = conflictWarning ?? estimate.warning;
    mileageNeedsManualEntry = conflictWarning ? true : estimate.requiresManualEntry;
    if (!conflictWarning) crossCheckEstimateAgainstFullHistory();
  }

  function crossCheckEstimateAgainstFullHistory() {
    if (mileage === undefined) return;
    const fullCheck = checkMileageConsistency(mileage, date, allMileagePoints, car.currentMileage);
    if (fullCheck.status !== "ok") {
      mileageWarning = describeMileageCheck(fullCheck);
      mileageNeedsManualEntry = true;
      conflictReferenceId = fullCheck.referenceId;
      conflictReferenceCategory = fullCheck.referenceCategory;
      conflictReferenceBatchIndex = fullCheck.referenceBatchIndex;
    }
  }

  if (category !== "bills") {
    const consistency =
      typeof mileageOnReceipt === "number"
        ? checkMileageConsistency(mileageOnReceipt, date, trustedMileagePoints, car.currentMileage)
        : null;
    const receiptConflict = consistency ? consistency.status !== "ok" : false;
    const conflictWarning =
      receiptConflict && consistency
        ? `The receipt appears to show ${mileageOnReceipt!.toLocaleString()} mi. ${describeMileageCheck(consistency)}`
        : undefined;
    if (receiptConflict && consistency) {
      conflictReferenceId = consistency.referenceId;
      conflictReferenceCategory = consistency.referenceCategory;
      conflictReferenceBatchIndex = consistency.referenceBatchIndex;
    }

    if (typeof mileageOnReceipt === "number" && !receiptConflict) {
      mileage = mileageOnReceipt;
    } else if (conflictWarning) {
      applyGenericMileageEstimate(conflictWarning);
    } else if (category === "fuel" && filledToFullGuess && litres) {
      const trustedFuelLogs = fuelLogs.filter((f) => isTrustworthy(f.mileageConfidence) && f.litres != null);
      const trustedBatchFullTankPoints = batchHints
        .filter((h) => h.category === "fuel" && typeof h.litres === "number" && guessFilledToFull(h.litres, undefined))
        .map((h) => ({ mileage: h.mileage, date: h.date }));
      const precedingFullTankMileage =
        [...trustedFuelLogs.map((f) => ({ mileage: f.mileage, date: f.date, filledToFull: !!f.filledToFull })), ...trustedBatchFullTankPoints.map((p) => ({ ...p, filledToFull: true }))]
          .filter((f) => f.filledToFull && new Date(f.date).getTime() < new Date(date).getTime())
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.mileage ?? null;
      const carOwnAverageMpg = computeActualMPG(
        trustedFuelLogs.map((f) => ({ id: f.id, mileage: f.mileage, litres: f.litres as number, filledToFull: !!f.filledToFull, date: f.date, mileageConfidence: f.mileageConfidence }))
      );
      const litresEstimate = estimateFuelMileageFromLitres(litres, precedingFullTankMileage, carOwnAverageMpg, {
        startingMileage: car.startingMileage,
        currentMileage: car.currentMileage,
        dateAdded: car.dateAdded,
      });
      if (litresEstimate) {
        const bounded = applyKnownBounds(litresEstimate.mileage, date, allPointsForBounds);
        mileage = bounded.mileage;
        mileageConfidence = litresEstimate.confidence;
        mileageWarning = bounded.boundsConflict
          ? bounded.boundsWarning
          : [litresEstimate.warning, bounded.boundsWarning].filter(Boolean).join(" ");
        mileageNeedsManualEntry = bounded.boundsConflict;
        if (!bounded.boundsConflict) crossCheckEstimateAgainstFullHistory();
      } else {
        applyGenericMileageEstimate();
      }
    } else {
      applyGenericMileageEstimate();
    }
  }

  if (category === "service") {
    const jobType = guessCarJobType(description) ?? "other";
    const notes = [
      withAiCaveat(description, forceReview, aiLowConfidence),
      mileageWarning ? `⚠ ${mileageWarning}` : null,
    ].filter(Boolean).join(" - ");
    const jobLabel = CAR_JOB_LABELS[jobType] ?? jobType;
    const aiDescription = buildAiDescription({ description: jobLabel, merchantName, address, city, categoryLabel: "Service" });
    const duplicate = findPossibleDuplicate(date, costGbp, serviceCandidates, description);
    const record = await createCarServiceRecord(email, {
      carId: car.id, jobType, cost: costGbp, mileage: mileage ?? car.currentMileage, date, notes,
      attachments: [attachment], needsReview: true, currencyConversion, mileageConfidence, aiDescription,
    });
    // No reminder auto-creation for cars yet - see the file header.
    if (mileageConfidence === undefined) await reestimateNearbyCarFuelLogs(email, car);
    return { id: record.id, category: "service", aiDescription, duplicate, jobType, cost: costGbp, mileage: mileage ?? car.currentMileage, mileageNeedsManualEntry, mileageWarningText: mileageNeedsManualEntry ? mileageWarning : undefined, mileageConflictReferenceId: conflictReferenceId, mileageConflictReferenceCategory: conflictReferenceCategory, mileageConflictReferenceBatchIndex: conflictReferenceBatchIndex, plateMismatch, vehicleMismatch, date, notes, attachment };
  }

  if (category === "fuel") {
    const aiDescription = buildAiDescription({ description: description || "Fuel", merchantName, address, city, categoryLabel: "Fuel" });
    const duplicate = findPossibleDuplicate(date, costGbp, fuelCandidates, `${(litres ?? 0).toFixed(1)}L fill-up`);
    const litresValue = litres ?? 0;
    const resolvedMileage = mileage ?? car.currentMileage;

    let finalMileageNeedsManualEntry = mileageNeedsManualEntry;
    let finalMileageWarning = mileageWarning;
    if (filledToFullGuess) {
      const fillCheck = checkFullTankPlausibility(
        litresValue,
        resolvedMileage,
        fuelLogs.filter((f) => isTrustworthy(f.mileageConfidence)).map((f) => ({ mileage: f.mileage }))
      );
      if (fillCheck && !fillCheck.plausible) {
        finalMileageNeedsManualEntry = true;
        finalMileageWarning = describeImplausibleFill(fillCheck, litresValue);
      }
    }

    const precedingFuelMileage = fuelLogs
      .filter((f) => isTrustworthy(f.mileageConfidence))
      .filter((f) => new Date(f.date).getTime() < new Date(date).getTime())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.mileage;

    const record = await createCarFuelLog(email, {
      carId: car.id, fuelType: car.fuelType, litres: litresValue, cost: costGbp, mileage: resolvedMileage, date,
      filledToFull: filledToFullGuess, attachments: [attachment], needsReview: true, currencyConversion, mileageConfidence, aiDescription,
    });
    if (mileageConfidence === undefined) await reestimateNearbyCarFuelLogs(email, car);
    return { id: record.id, category: "fuel", aiDescription, duplicate, litres: litresValue, cost: costGbp, mileage: resolvedMileage, mileageNeedsManualEntry: finalMileageNeedsManualEntry, mileageWarningText: finalMileageNeedsManualEntry ? finalMileageWarning : undefined, mileageConflictReferenceId: conflictReferenceId, mileageConflictReferenceCategory: conflictReferenceCategory, mileageConflictReferenceBatchIndex: conflictReferenceBatchIndex, plateMismatch, vehicleMismatch, date, filledToFull: filledToFullGuess, attachment, precedingFuelMileage, tankCapacityLitres: undefined };
  }

  if (category === "mods") {
    const modCategory = guessCarModCategory(description) ?? "other-accessory";
    const modNotes = [
      aiCaveatOnly(forceReview, aiLowConfidence),
      mileageWarning ? `⚠ ${mileageWarning}` : null,
    ].filter(Boolean).join(" - ");
    const aiDescription = buildAiDescription({ description, merchantName, address, city, categoryLabel: "Parts & Accessories" });
    const duplicate = findPossibleDuplicate(date, costGbp, modCandidates, description);
    const record = await createCarMod(email, {
      carId: car.id, category: modCategory, name: description, cost: costGbp, mileage: mileage ?? car.currentMileage, date,
      notes: modNotes, attachments: [attachment], needsReview: true, currencyConversion, mileageConfidence, aiDescription,
    });
    if (mileageConfidence === undefined) await reestimateNearbyCarFuelLogs(email, car);
    return { id: record.id, category: "mods", aiDescription, duplicate, name: description, modCategory, cost: costGbp, mileage: mileage ?? car.currentMileage, mileageNeedsManualEntry, mileageWarningText: mileageNeedsManualEntry ? mileageWarning : undefined, mileageConflictReferenceId: conflictReferenceId, mileageConflictReferenceCategory: conflictReferenceCategory, mileageConflictReferenceBatchIndex: conflictReferenceBatchIndex, plateMismatch, vehicleMismatch, date, notes: modNotes, attachment };
  }

  const billType = guessCarBillType(description) ?? "insurance";
  const billNotes = withAiCaveat(description, forceReview, aiLowConfidence);
  const billLabel = CAR_BILL_LABELS[billType] ?? billType;
  const aiDescription = buildAiDescription({ description: billLabel, merchantName, address, city, categoryLabel: "Insurance, tax, MOT & finance" });
  const duplicate = findPossibleDuplicate(date, costGbp, billCandidates, description);
  const record = await createCarBill(email, {
    carId: car.id, billType, cost: costGbp, date, notes: billNotes, attachments: [attachment], needsReview: true, currencyConversion, aiDescription,
  });
  // No reminder auto-creation for cars yet - see the file header.
  return { id: record.id, category: "bills", aiDescription, duplicate, billType, cost: costGbp, plateMismatch, vehicleMismatch, date, notes: billNotes, attachment };
}
