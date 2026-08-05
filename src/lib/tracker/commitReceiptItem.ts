// Place at: src/lib/tracker/commitReceiptItem.ts
//
// One item in, one record created, using whatever's genuinely in the
// database at the moment this runs - nothing cached across calls. That's
// deliberate: called once per item as a human reaches it in the review
// queue, a fresh fetch here is exactly what lets a correction to item #1
// actually improve item #2's starting guess, rather than every item in a
// batch being estimated from the same stale snapshot taken before any
// human ever looked at any of it (the bug this replaces).

import { getServiceRecords, createServiceRecord } from "@/lib/tracker/serviceRecord";
import { getFuelLogs, createFuelLog } from "@/lib/tracker/fuelLog";
import { getMods, createMod } from "@/lib/tracker/mod";
import { getBills, createBill } from "@/lib/tracker/bill";
import { createReminder } from "@/lib/tracker/reminder";
import { estimateMileage, type MileagePoint } from "@/lib/tracker/mileageEstimate";
import { guessJobType, guessModCategory, guessBillType } from "@/lib/tracker/guessCategory";
import { JOB_LABELS, JOB_REMINDER_DEFAULTS } from "@/lib/tracker/jobTypes";
import { BILL_LABELS, BILL_REMINDER_DEFAULTS } from "@/lib/tracker/billTypes";
import { buildAiDescription } from "@/lib/tracker/aiDescription";
import { findPossibleDuplicate, type DuplicateMatch } from "@/lib/tracker/duplicateCheck";
import { findMileageConflict } from "@/lib/tracker/mileageConflict";
import { guessFilledToFull } from "@/lib/tracker/tankGuess";
import { checkFullTankPlausibility, describeImplausibleFill } from "@/lib/tracker/fuelPlausibility";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";
import type { BikeDoc } from "@/lib/tracker/bike";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export type ReviewQueueEntry =
  | { id: string; category: "service"; aiDescription: string; duplicate: DuplicateMatch | null; jobType: string; cost: number; mileage: number; mileageNeedsManualEntry: boolean; mileageWarningText?: string; date: string; notes: string; attachment: Attachment }
  | { id: string; category: "fuel"; aiDescription: string; duplicate: DuplicateMatch | null; litres: number; cost: number; mileage: number; mileageNeedsManualEntry: boolean; mileageWarningText?: string; date: string; filledToFull: boolean; attachment: Attachment; precedingFuelMileage?: number }
  | { id: string; category: "mods"; aiDescription: string; duplicate: DuplicateMatch | null; name: string; modCategory: string; cost: number; mileage: number; mileageNeedsManualEntry: boolean; mileageWarningText?: string; date: string; notes: string; attachment: Attachment }
  | { id: string; category: "bills"; aiDescription: string; duplicate: DuplicateMatch | null; billType: string; cost: number; date: string; notes: string; attachment: Attachment };

export async function commitReceiptItem(
  email: string,
  bike: BikeDoc,
  item: ParsedReceiptItem,
  // Other receipts in the same scan batch that have a mileage actually
  // printed on them, whether or not they've been reached/committed yet -
  // an exact reading is trustworthy regardless of processing order, so
  // it's worth using both to estimate this item and to sanity-check it.
  batchHints: { date: string; mileage: number }[] = []
): Promise<ReviewQueueEntry> {
  const { category, date, costGbp, description, litres, mileageOnReceipt, merchantName, address, city, attachment, currencyConversion, forceReview } = item;

  // Fresh, every call - includes anything committed or corrected earlier
  // in this same review session, since those are real, already-persisted
  // writes by the time this runs. No in-memory carry-over needed.
  const [records, fuelLogs, mods, bills] = await Promise.all([
    getServiceRecords(email, bike.id),
    getFuelLogs(email, bike.id),
    getMods(email, bike.id),
    getBills(email, bike.id),
  ]);
  const serviceCandidates = records.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage, cost: r.cost, description: JOB_LABELS[r.jobType] ?? r.jobType }));
  const fuelCandidates = fuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage, cost: f.cost, description: `${f.litres.toFixed(1)}L fill-up` }));
  const modCandidates = mods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage, cost: m.cost, description: m.name }));
  const billCandidates = bills.map((b) => ({ id: b.id, date: b.date, cost: b.cost, description: BILL_LABELS[b.billType] ?? b.billType }));

  // Trust criterion: an exact reading (mileageConfidence left unset,
  // meaning it came straight off a receipt or was typed in directly) or
  // one the human has actually confirmed by saving through its own edit
  // form. Deliberately NOT "estimated" or "interpolated" alone - those
  // are the AI's own guess, not yet reviewed by anyone, and the whole
  // point of this fix is that an unreviewed guess shouldn't get to
  // anchor another guess. Because the review queue only advances
  // normally via Save (which the PATCH route already flips to
  // "confirmed"), every item a human has actually looked at and moved
  // past is exactly the set this correctly picks up - nothing extra to
  // track, no new field needed.
  const isTrustworthy = (confidence: "interpolated" | "estimated" | "confirmed" | undefined) => !confidence || confidence === "confirmed";
  const trustedMileagePoints: MileagePoint[] = [
    ...records.filter((r) => isTrustworthy(r.mileageConfidence)).map((r) => ({ date: r.date, mileage: r.mileage })),
    ...fuelLogs.filter((f) => isTrustworthy(f.mileageConfidence)).map((f) => ({ date: f.date, mileage: f.mileage })),
    ...mods.filter((m) => isTrustworthy(m.mileageConfidence)).map((m) => ({ date: m.date, mileage: m.mileage })),
    ...batchHints,
  ];

  let mileage: number | undefined;
  let mileageConfidence: "interpolated" | "estimated" | undefined;
  let mileageWarning: string | undefined;
  let mileageNeedsManualEntry = false;
  if (category !== "bills") {
    // A figure printed on the receipt is normally trusted outright - but
    // if it's inconsistent with everything else already known (a
    // misread digit, or genuinely the wrong bike's receipt), don't
    // silently create a broken timeline. Fall back to asking the human
    // instead of trusting an OCR reading that doesn't add up.
    const receiptConflict =
      typeof mileageOnReceipt === "number" ? findMileageConflict(date, mileageOnReceipt, null, trustedMileagePoints) : null;

    if (typeof mileageOnReceipt === "number" && !receiptConflict) {
      mileage = mileageOnReceipt;
    } else {
      const estimate = estimateMileage(date, trustedMileagePoints, {
        startingMileage: bike.startingMileage,
        currentMileage: bike.currentMileage,
        dateAdded: bike.dateAdded,
      });
      mileage = estimate.mileage;
      mileageConfidence = estimate.confidence;
      mileageWarning = receiptConflict
        ? `The receipt appears to show ${mileageOnReceipt!.toLocaleString()} mi, but that conflicts with another record - please check and enter the real figure.`
        : estimate.warning;
      mileageNeedsManualEntry = receiptConflict ? true : estimate.requiresManualEntry;
    }
  }

  if (category === "service") {
    const jobType = guessJobType(description) ?? "other";
    const notes = [
      forceReview ? `${description} (currency could not be auto-converted - please check the amount)` : description,
      mileageWarning ? `⚠️ ${mileageWarning}` : null,
    ].filter(Boolean).join(" - ");
    const jobLabel = JOB_LABELS[jobType] ?? jobType;
    const aiDescription = buildAiDescription({ description: jobLabel, merchantName, address, city, categoryLabel: "Service" });
    const duplicate = findPossibleDuplicate(date, costGbp, serviceCandidates);
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
    return { id: record.id, category: "service", aiDescription, duplicate, jobType, cost: costGbp, mileage: mileage ?? bike.currentMileage, mileageNeedsManualEntry, mileageWarningText: mileageNeedsManualEntry ? mileageWarning : undefined, date, notes, attachment };
  }

  if (category === "fuel") {
    const aiDescription = buildAiDescription({ description: description || "Fuel", merchantName, address, city, categoryLabel: "Fuel" });
    const duplicate = findPossibleDuplicate(date, costGbp, fuelCandidates);
    const litresValue = litres ?? 0;
    const filledToFullGuess = guessFilledToFull(litresValue, bike.tankCapacityLitres);
    const resolvedMileage = mileage ?? bike.currentMileage;

    // A full tank that implies an impossible mpg against the nearest
    // earlier trusted fuel entry means the mileage itself is wrong, not
    // just "worth flagging" - same principle as the chronological check,
    // applied to a different kind of impossibility. Downgrades to
    // manual entry rather than silently saving a number that can't be
    // right, exactly like every other case where this pipeline isn't
    // confident.
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

    // Found by date, not mileage - unlike the plausibility check above,
    // this needs to work even when there's no trustworthy mileage
    // resolved yet at all (that's exactly the case a human is about to
    // fix), so it can't sort by the very number that's in question. Sent
    // to the client purely so the review queue can show a live "this
    // would work out to about X mpg" as the person types, using the
    // same maths the server-side check uses - a live aid for judgement,
    // not a second source of truth.
    const precedingFuelMileage = fuelLogs
      .filter((f) => isTrustworthy(f.mileageConfidence))
      .filter((f) => new Date(f.date).getTime() < new Date(date).getTime())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.mileage;

    const record = await createFuelLog(email, {
      bikeId: bike.id, litres: litresValue, cost: costGbp, mileage: resolvedMileage, date,
      filledToFull: filledToFullGuess, attachments: [attachment], needsReview: true, currencyConversion, mileageConfidence, aiDescription,
    });
    return { id: record.id, category: "fuel", aiDescription, duplicate, litres: litresValue, cost: costGbp, mileage: resolvedMileage, mileageNeedsManualEntry: finalMileageNeedsManualEntry, mileageWarningText: finalMileageNeedsManualEntry ? finalMileageWarning : undefined, date, filledToFull: filledToFullGuess, attachment, precedingFuelMileage };
  }

  if (category === "mods") {
    const modCategory = guessModCategory(description) ?? "other-accessory";
    const modNotes = [
      forceReview ? "Currency could not be auto-converted - please check the amount" : null,
      mileageWarning ? `⚠️ ${mileageWarning}` : null,
    ].filter(Boolean).join(" - ");
    const aiDescription = buildAiDescription({ description, merchantName, address, city, categoryLabel: "Parts & Accessories" });
    const duplicate = findPossibleDuplicate(date, costGbp, modCandidates);
    const record = await createMod(email, {
      bikeId: bike.id, category: modCategory, name: description, cost: costGbp, mileage: mileage ?? bike.currentMileage, date,
      notes: modNotes, attachments: [attachment], needsReview: true, currencyConversion, mileageConfidence, aiDescription,
    });
    return { id: record.id, category: "mods", aiDescription, duplicate, name: description, modCategory, cost: costGbp, mileage: mileage ?? bike.currentMileage, mileageNeedsManualEntry, mileageWarningText: mileageNeedsManualEntry ? mileageWarning : undefined, date, notes: modNotes, attachment };
  }

  const billType = guessBillType(description) ?? "insurance";
  const billNotes = forceReview ? `${description} (currency could not be auto-converted - please check the amount)` : description;
  const billLabel = BILL_LABELS[billType] ?? billType;
  const aiDescription = buildAiDescription({ description: billLabel, merchantName, address, city, categoryLabel: "Insurance, tax & MOT" });
  const duplicate = findPossibleDuplicate(date, costGbp, billCandidates);
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
  return { id: record.id, category: "bills", aiDescription, duplicate, billType, cost: costGbp, date, notes: billNotes, attachment };
}
