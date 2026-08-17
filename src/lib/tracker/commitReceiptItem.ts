// Place at: src/lib/tracker/commitReceiptItem.ts

import { getServiceRecords, createServiceRecord } from "@/lib/tracker/serviceRecord";
import { getFuelLogs, createFuelLog } from "@/lib/tracker/fuelLog";
import { getMods, createMod } from "@/lib/tracker/mod";
import { getBills, createBill } from "@/lib/tracker/bill";
import { createReminder } from "@/lib/tracker/reminder";
import { estimateMileage, estimateFuelMileageFromLitres, applyKnownBounds, type MileagePoint } from "@/lib/tracker/mileageEstimate";
import { computeActualMPG } from "@/lib/tracker/mpgCalc";
import { guessJobType, guessModCategory, guessBillType } from "@/lib/tracker/guessCategory";
import { JOB_LABELS, JOB_REMINDER_DEFAULTS } from "@/lib/tracker/jobTypes";
import { BILL_LABELS, BILL_REMINDER_DEFAULTS } from "@/lib/tracker/billTypes";
import { buildAiDescription } from "@/lib/tracker/aiDescription";
import { findPossibleDuplicate, type DuplicateMatch } from "@/lib/tracker/duplicateCheck";
import { checkMileageConsistency, describeMileageCheck, type HistoryPoint } from "@/lib/tracker/mileageCheck";
import { guessFilledToFull } from "@/lib/tracker/tankGuess";
import { checkFullTankPlausibility, describeImplausibleFill } from "@/lib/tracker/fuelPlausibility";
import { normalizePlate, allKnownPlates } from "@/lib/tracker/reportAccess";
import { reestimateFuelMileage } from "@/lib/tracker/reestimateFuelMileage";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";
import type { BikeDoc } from "@/lib/tracker/bike";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export interface PlateMismatch {
  registrationOnReceipt: string;
}

export interface VehicleMismatch {
  makeOnReceipt: string;
  modelOnReceipt: string | null;
}

// Loose match on purpose - receipts render the same make in enough
// different ways ("Honda", "Honda Motor Co", "HONDA") that a strict
// equality check would flag genuine matches constantly. Stripping
// everything but letters/digits and checking containment either
// direction catches those safely while still catching a genuinely
// different make (Honda vs Royal Enfield shares no substring either way).
function normalizeVehicleName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function vehicleNamesMatch(a: string, b: string): boolean {
  const na = normalizeVehicleName(a);
  const nb = normalizeVehicleName(b);
  if (!na || !nb) return true;
  return na.includes(nb) || nb.includes(na);
}

// Best-effort, non-blocking - only ever called when mileageConfidence
// ended up undefined, meaning the printed mileage on the receipt was
// trusted directly rather than estimated. That's the one moment a new
// genuine anchor has actually appeared; anything estimated or
// interpolated is itself just a guess and must never trigger this.
// Failure here should never undo an otherwise-successful commit.
async function reestimateNearbyFuelLogs(email: string, bike: BikeDoc) {
  try {
    await reestimateFuelMileage(email, bike);
  } catch (err) {
    console.error("Fuel mileage re-estimation after receipt commit failed:", err);
  }
}

export type ReviewQueueEntry =
  | { id: string; category: "service"; aiDescription: string; duplicate: DuplicateMatch | null; jobType: string; cost: number; mileage: number; mileageNeedsManualEntry: boolean; mileageWarningText?: string; mileageConflictReferenceId?: string; mileageConflictReferenceCategory?: "service" | "fuel" | "mods" | "mot"; mileageConflictReferenceBatchIndex?: number; plateMismatch: PlateMismatch | null; vehicleMismatch: VehicleMismatch | null; date: string; notes: string; attachment: Attachment }
  | { id: string; category: "fuel"; aiDescription: string; duplicate: DuplicateMatch | null; litres: number; cost: number; mileage: number; mileageNeedsManualEntry: boolean; mileageWarningText?: string; mileageConflictReferenceId?: string; mileageConflictReferenceCategory?: "service" | "fuel" | "mods" | "mot"; mileageConflictReferenceBatchIndex?: number; plateMismatch: PlateMismatch | null; vehicleMismatch: VehicleMismatch | null; date: string; filledToFull: boolean; attachment: Attachment; precedingFuelMileage?: number; tankCapacityLitres?: number }
  | { id: string; category: "mods"; aiDescription: string; duplicate: DuplicateMatch | null; name: string; modCategory: string; cost: number; mileage: number; mileageNeedsManualEntry: boolean; mileageWarningText?: string; mileageConflictReferenceId?: string; mileageConflictReferenceCategory?: "service" | "fuel" | "mods" | "mot"; mileageConflictReferenceBatchIndex?: number; plateMismatch: PlateMismatch | null; vehicleMismatch: VehicleMismatch | null; date: string; notes: string; attachment: Attachment }
  | { id: string; category: "bills"; aiDescription: string; duplicate: DuplicateMatch | null; billType: string; cost: number; plateMismatch: PlateMismatch | null; vehicleMismatch: VehicleMismatch | null; date: string; notes: string; attachment: Attachment };

export async function commitReceiptItem(
  email: string,
  bike: BikeDoc,
  item: ParsedReceiptItem,
  batchHints: { date: string; mileage: number; batchIndex?: number; category?: "service" | "fuel" | "mods" | "mot"; litres?: number }[] = [],
  // Same idea as batchHints, but deliberately kept separate: these are
  // already-committed batch peers, whose mileage may itself be an AI
  // estimate rather than a real printed reading. That makes them unfit
  // to compute a RATE from (batchHints above stays reserved for that),
  // but they're still real, already-saved numbers a new estimate must
  // never contradict - exactly what applyKnownBounds is for. Folding
  // these into batchHints instead would let one guess quietly become
  // the foundation for the next, which is the exact chaining risk this
  // file has always deliberately avoided.
  boundsOnlyHints: { date: string; mileage: number; batchIndex?: number }[] = []
): Promise<ReviewQueueEntry> {
  const { category, date, costGbp, description, litres, mileageOnReceipt, registrationOnReceipt, merchantName, address, city, vehicleMakeOnReceipt, vehicleModelOnReceipt, attachment, currencyConversion, forceReview } = item;

  // The very first thing checked, before anything category- or
  // mileage-specific: does this receipt even claim to be for THIS bike?
  // A receipt showing a plate that's never been this bike's - now or
  // historically - is a real, distinct signal worth surfacing on its
  // own, independent of whatever else is or isn't wrong with the
  // mileage. Checked once here rather than per-category below, since
  // it doesn't depend on category at all.
  const plateMismatch: PlateMismatch | null =
    registrationOnReceipt && !allKnownPlates(bike).includes(normalizePlate(registrationOnReceipt))
      ? { registrationOnReceipt }
      : null;

  // Same idea, for make/model rather than plate - the AI only ever
  // returns a value here when the receipt genuinely states which
  // vehicle it's for (see the prompt), so a value present at all is
  // already a fairly deliberate signal; it's just a question of whether
  // it agrees with the bike this receipt is being logged against.
  const vehicleMismatch: VehicleMismatch | null =
    vehicleMakeOnReceipt && !vehicleNamesMatch(vehicleMakeOnReceipt, bike.make)
      ? { makeOnReceipt: vehicleMakeOnReceipt, modelOnReceipt: vehicleModelOnReceipt }
      : null;

  const [records, fuelLogs, mods, bills] = await Promise.all([
    getServiceRecords(email, bike.id),
    getFuelLogs(email, bike.id),
    getMods(email, bike.id),
    getBills(email, bike.id),
  ]);
  // description here is the specific text (r.notes / the receipt's own
  // description), not the job-type label - two genuinely different line
  // items on the same invoice routinely share a job type (both "Other",
  // say), which would make every duplicate check against them compare
  // identical labels and never tell them apart. The label is still fine
  // for fuel and mods, since litres and mod names are already specific.
  const serviceCandidates = records.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage, cost: r.cost, description: r.notes || (JOB_LABELS[r.jobType] ?? r.jobType) }));
  const fuelCandidates = fuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage, cost: f.cost, description: `${f.litres.toFixed(1)}L fill-up` }));
  const modCandidates = mods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage, cost: m.cost, description: m.name }));
  const billCandidates = bills.map((b) => ({ id: b.id, date: b.date, cost: b.cost, description: b.notes || (BILL_LABELS[b.billType] ?? b.billType) }));

  const isTrustworthy = (confidence: "interpolated" | "estimated" | "confirmed" | undefined) => !confidence || confidence === "confirmed";
  // Now carries id + category for every point, not just date/mileage -
  // needed so a detected conflict can name the exact entry it clashes
  // with, not just describe a number and a date.
  const trustedMileagePoints: HistoryPoint[] = [
    ...records.filter((r) => isTrustworthy(r.mileageConfidence)).map((r) => ({ id: r.id, category: "service" as const, date: r.date, mileage: r.mileage })),
    ...fuelLogs.filter((f) => isTrustworthy(f.mileageConfidence)).map((f) => ({ id: f.id, category: "fuel" as const, date: f.date, mileage: f.mileage })),
    ...mods.filter((m) => isTrustworthy(m.mileageConfidence)).map((m) => ({ id: m.id, category: "mods" as const, date: m.date, mileage: m.mileage })),
    // DVSA-confirmed MOT odometer readings are always trusted - no
    // mileageConfidence field on bills at all, since an official test
    // reading doesn't carry the same "AI guessed this" uncertainty a
    // receipt-derived estimate does.
    ...bills.filter((b) => b.billType === "mot-test" && b.mileage != null).map((b) => ({ id: b.id, category: "mot" as const, date: b.date, mileage: b.mileage as number })),
    ...batchHints,
  ];
  const trustedMileagePointsForEstimate: MileagePoint[] = trustedMileagePoints.map((p) => ({ date: p.date, mileage: p.mileage }));
  // Every logged point regardless of confidence, unlike
  // trustedMileagePoints above - an unconfirmed prior estimate still
  // represents a real, already-saved number, and nothing computed after
  // it should be allowed to silently contradict it. Only used to
  // cross-check a freshly computed estimate against, never to compute
  // one in the first place - that distinction is the whole point:
  // an untrusted point isn't reliable enough to extrapolate a RATE
  // from, but its own mileage is still a real floor or ceiling.
  const allMileagePoints: HistoryPoint[] = [
    ...records.map((r) => ({ id: r.id, category: "service" as const, date: r.date, mileage: r.mileage })),
    ...fuelLogs.map((f) => ({ id: f.id, category: "fuel" as const, date: f.date, mileage: f.mileage })),
    ...mods.map((m) => ({ id: m.id, category: "mods" as const, date: m.date, mileage: m.mileage })),
    ...bills.filter((b) => b.billType === "mot-test" && b.mileage != null).map((b) => ({ id: b.id, category: "mot" as const, date: b.date, mileage: b.mileage as number })),
    ...batchHints,
    ...boundsOnlyHints,
  ];
  // Same set, reduced to the {date, mileage} shape estimateMileage's
  // bounds parameter and applyKnownBounds both actually need.
  const allPointsForBounds: MileagePoint[] = allMileagePoints.map((p) => ({ date: p.date, mileage: p.mileage }));

  let mileage: number | undefined;
  let mileageConfidence: "interpolated" | "estimated" | undefined;
  let mileageWarning: string | undefined;
  let mileageNeedsManualEntry = false;
  let conflictReferenceId: string | undefined;
  let conflictReferenceCategory: "service" | "fuel" | "mods" | "mot" | undefined;
  let conflictReferenceBatchIndex: number | undefined;

  const filledToFullGuess = category === "fuel" ? guessFilledToFull(litres ?? 0, bike.tankCapacityLitres) : false;

  function applyGenericMileageEstimate(conflictWarning?: string) {
    const estimate = estimateMileage(
      date,
      trustedMileagePointsForEstimate,
      {
        startingMileage: bike.startingMileage,
        currentMileage: bike.currentMileage,
        dateAdded: bike.dateAdded,
      },
      allPointsForBounds
    );
    mileage = estimate.mileage;
    mileageConfidence = estimate.confidence;
    mileageWarning = conflictWarning ?? estimate.warning;
    mileageNeedsManualEntry = conflictWarning ? true : estimate.requiresManualEntry;
    if (!conflictWarning) crossCheckEstimateAgainstFullHistory();
  }

  // Cross-checks whatever the current `mileage` value is against EVERY
  // logged point, not just the trustworthy subset used to COMPUTE it -
  // this is what catches an estimate that's internally reasonable given
  // the anchors it trusted, but still contradicts an unconfirmed prior
  // record sitting right there in the database. Deliberately its own
  // function, not folded into applyGenericMileageEstimate alone -
  // the litres-informed estimate below computes a DIFFERENT way and
  // needs exactly the same check applied to its own result, which is
  // exactly the gap that let this slip through the first time: fixing
  // only the generic path left every litres-based estimate (the common
  // case for a normal "filled to full" fuel receipt) completely
  // unchecked.
  function crossCheckEstimateAgainstFullHistory() {
    if (mileage === undefined) return;
    const fullCheck = checkMileageConsistency(mileage, date, allMileagePoints, bike.currentMileage);
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
        ? checkMileageConsistency(mileageOnReceipt, date, trustedMileagePoints, bike.currentMileage)
        : null;
    const receiptConflict = consistency ? consistency.status !== "ok" : false;
    // As specific as the live, on-save check gets - the receipt-reading
    // caveat stays first, since that part genuinely is worth flagging
    // separately (the AI might have misread it), then the exact same
    // wording describeMileageCheck produces everywhere else, naming the
    // real number rather than leaving the owner to guess at one.
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
      const trustedFuelLogs = fuelLogs.filter((f) => isTrustworthy(f.mileageConfidence));
      // A batch peer's own printed mileage is just as real an anchor as
      // an already-saved database record - the only thing that made it
      // "not yet available" before was that it hadn't been committed
      // yet, not that it's any less trustworthy. Deliberately still
      // gated the same way saved records are: only a peer with its OWN
      // printed reading counts (never another peer's estimate), so this
      // can never chain one guess off another.
      const trustedBatchFullTankPoints = batchHints
        .filter((h) => h.category === "fuel" && typeof h.litres === "number" && guessFilledToFull(h.litres, bike.tankCapacityLitres))
        .map((h) => ({ mileage: h.mileage, date: h.date }));
      const precedingFullTankMileage =
        [...trustedFuelLogs.map((f) => ({ mileage: f.mileage, date: f.date, filledToFull: f.filledToFull })), ...trustedBatchFullTankPoints.map((p) => ({ ...p, filledToFull: true }))]
          .filter((f) => f.filledToFull && new Date(f.date).getTime() < new Date(date).getTime())
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.mileage ?? null;
      const bikeOwnAverageMpg = computeActualMPG(
        trustedFuelLogs.map((f) => ({ id: f.id, mileage: f.mileage, litres: f.litres, filledToFull: f.filledToFull, date: f.date, mileageConfidence: f.mileageConfidence }))
      );
      const litresEstimate = estimateFuelMileageFromLitres(litres, precedingFullTankMileage, bikeOwnAverageMpg, {
        startingMileage: bike.startingMileage,
        currentMileage: bike.currentMileage,
        dateAdded: bike.dateAdded,
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
    const jobType = guessJobType(description) ?? "other";
    const notes = [
      forceReview ? `${description} (currency could not be auto-converted - please check the amount)` : description,
      mileageWarning ? `⚠ ${mileageWarning}` : null,
    ].filter(Boolean).join(" - ");
    const jobLabel = JOB_LABELS[jobType] ?? jobType;
    const aiDescription = buildAiDescription({ description: jobLabel, merchantName, address, city, categoryLabel: "Service" });
    const duplicate = findPossibleDuplicate(date, costGbp, serviceCandidates, description);
    const record = await createServiceRecord(email, {
      bikeId: bike.id, jobType, cost: costGbp, mileage: mileage ?? bike.currentMileage, date, notes,
      attachments: [attachment], needsReview: true, currencyConversion, mileageConfidence, aiDescription,
    });
    const reminderDefault = JOB_REMINDER_DEFAULTS[jobType];
    if (reminderDefault) {
      await createReminder(email, {
        bikeId: bike.id, name: jobLabel, intervalType: reminderDefault.type, intervalValue: reminderDefault.value,
        baseMileage: mileage ?? bike.currentMileage, date, sourceKey: `service:${jobType}`,
      });
    }
    if (mileageConfidence === undefined) await reestimateNearbyFuelLogs(email, bike);
    return { id: record.id, category: "service", aiDescription, duplicate, jobType, cost: costGbp, mileage: mileage ?? bike.currentMileage, mileageNeedsManualEntry, mileageWarningText: mileageNeedsManualEntry ? mileageWarning : undefined, mileageConflictReferenceId: conflictReferenceId, mileageConflictReferenceCategory: conflictReferenceCategory, mileageConflictReferenceBatchIndex: conflictReferenceBatchIndex, plateMismatch, vehicleMismatch, date, notes, attachment };
  }

  if (category === "fuel") {
    const aiDescription = buildAiDescription({ description: description || "Fuel", merchantName, address, city, categoryLabel: "Fuel" });
    const duplicate = findPossibleDuplicate(date, costGbp, fuelCandidates, `${(litres ?? 0).toFixed(1)}L fill-up`);
    const litresValue = litres ?? 0;
    const resolvedMileage = mileage ?? bike.currentMileage;

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

    const record = await createFuelLog(email, {
      bikeId: bike.id, litres: litresValue, cost: costGbp, mileage: resolvedMileage, date,
      filledToFull: filledToFullGuess, attachments: [attachment], needsReview: true, currencyConversion, mileageConfidence, aiDescription,
    });
    if (mileageConfidence === undefined) await reestimateNearbyFuelLogs(email, bike);
    return { id: record.id, category: "fuel", aiDescription, duplicate, litres: litresValue, cost: costGbp, mileage: resolvedMileage, mileageNeedsManualEntry: finalMileageNeedsManualEntry, mileageWarningText: finalMileageNeedsManualEntry ? finalMileageWarning : undefined, mileageConflictReferenceId: conflictReferenceId, mileageConflictReferenceCategory: conflictReferenceCategory, mileageConflictReferenceBatchIndex: conflictReferenceBatchIndex, plateMismatch, vehicleMismatch, date, filledToFull: filledToFullGuess, attachment, precedingFuelMileage, tankCapacityLitres: bike.tankCapacityLitres };
  }

  if (category === "mods") {
    const modCategory = guessModCategory(description) ?? "other-accessory";
    const modNotes = [
      forceReview ? "Currency could not be auto-converted - please check the amount" : null,
      mileageWarning ? `⚠ ${mileageWarning}` : null,
    ].filter(Boolean).join(" - ");
    const aiDescription = buildAiDescription({ description, merchantName, address, city, categoryLabel: "Parts & Accessories" });
    const duplicate = findPossibleDuplicate(date, costGbp, modCandidates, description);
    const record = await createMod(email, {
      bikeId: bike.id, category: modCategory, name: description, cost: costGbp, mileage: mileage ?? bike.currentMileage, date,
      notes: modNotes, attachments: [attachment], needsReview: true, currencyConversion, mileageConfidence, aiDescription,
    });
    if (mileageConfidence === undefined) await reestimateNearbyFuelLogs(email, bike);
    return { id: record.id, category: "mods", aiDescription, duplicate, name: description, modCategory, cost: costGbp, mileage: mileage ?? bike.currentMileage, mileageNeedsManualEntry, mileageWarningText: mileageNeedsManualEntry ? mileageWarning : undefined, mileageConflictReferenceId: conflictReferenceId, mileageConflictReferenceCategory: conflictReferenceCategory, mileageConflictReferenceBatchIndex: conflictReferenceBatchIndex, plateMismatch, vehicleMismatch, date, notes: modNotes, attachment };
  }

  const billType = guessBillType(description) ?? "insurance";
  const billNotes = forceReview ? `${description} (currency could not be auto-converted - please check the amount)` : description;
  const billLabel = BILL_LABELS[billType] ?? billType;
  const aiDescription = buildAiDescription({ description: billLabel, merchantName, address, city, categoryLabel: "Insurance, tax & MOT" });
  const duplicate = findPossibleDuplicate(date, costGbp, billCandidates, description);
  const record = await createBill(email, {
    bikeId: bike.id, billType, cost: costGbp, date, notes: billNotes, attachments: [attachment], needsReview: true, currencyConversion, aiDescription,
  });
  const reminderDefault = BILL_REMINDER_DEFAULTS[billType];
  if (reminderDefault) {
    await createReminder(email, {
      bikeId: bike.id, name: `${billLabel} renewal`, intervalType: reminderDefault.type, intervalValue: reminderDefault.value,
      baseMileage: bike.currentMileage, date, sourceKey: `bill:${billType}`,
    });
  }
  return { id: record.id, category: "bills", aiDescription, duplicate, billType, cost: costGbp, plateMismatch, vehicleMismatch, date, notes: billNotes, attachment };
}
