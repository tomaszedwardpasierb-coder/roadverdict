// Place at: src/app/api/tracker/commit-receipt-items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike } from "@/lib/tracker/bike";
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
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";

export const dynamic = "force-dynamic";

export type ReviewQueueEntry =
  | { id: string; category: "service"; aiDescription: string; duplicate: DuplicateMatch | null; jobType: string; cost: number; mileage: number; mileageNeedsManualEntry: boolean; date: string; notes: string }
  | { id: string; category: "fuel"; aiDescription: string; duplicate: DuplicateMatch | null; litres: number; cost: number; mileage: number; mileageNeedsManualEntry: boolean; date: string; filledToFull: boolean }
  | { id: string; category: "mods"; aiDescription: string; duplicate: DuplicateMatch | null; name: string; modCategory: string; cost: number; mileage: number; mileageNeedsManualEntry: boolean; date: string; notes: string }
  | { id: string; category: "bills"; aiDescription: string; duplicate: DuplicateMatch | null; billType: string; cost: number; date: string; notes: string };

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  let body: { items?: ParsedReceiptItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Nothing to commit." }, { status: 400 });
  }

  // Trust nothing about ordering from the client - re-sort here too.
  // Cheap insurance, and it's what actually makes the "true chronological
  // order" guarantee real rather than just assumed.
  const items = [...body.items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  try {
    // Seeded once from the database, then grown in memory as this loop
    // commits each item - by the time item #5 (in date order) is being
    // estimated, items #1-4 from this SAME batch are already in these
    // arrays as real, committed anchors, not just whatever existed
    // before the scan started.
    const [dbRecords, dbFuelLogs, dbMods, dbBills] = await Promise.all([
      getServiceRecords(session.email, bike.id),
      getFuelLogs(session.email, bike.id),
      getMods(session.email, bike.id),
      getBills(session.email, bike.id),
    ]);

    const committedServiceRecords = dbRecords.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage, cost: r.cost, description: JOB_LABELS[r.jobType] ?? r.jobType }));
    const committedFuelLogs = dbFuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage, cost: f.cost, description: `${f.litres.toFixed(1)}L fill-up` }));
    const committedMods = dbMods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage, cost: m.cost, description: m.name }));
    const committedBills = dbBills.map((b) => ({ id: b.id, date: b.date, cost: b.cost, description: BILL_LABELS[b.billType] ?? b.billType }));

    const createdEntries: ReviewQueueEntry[] = [];
    const createdCategories: string[] = [];

    for (const item of items) {
      const { category, date, costGbp, description, litres, mileageOnReceipt, merchantName, address, city, attachment, currencyConversion, forceReview } = item;

      const knownMileagePoints: MileagePoint[] = [
        ...committedServiceRecords.map((r) => ({ date: r.date, mileage: r.mileage })),
        ...committedFuelLogs.map((f) => ({ date: f.date, mileage: f.mileage })),
        ...committedMods.map((m) => ({ date: m.date, mileage: m.mileage })),
      ];

      let mileage: number | undefined;
      let mileageConfidence: "interpolated" | "estimated" | undefined;
      let mileageWarning: string | undefined;
      let mileageNeedsManualEntry = false;
      if (category !== "bills") {
        if (typeof mileageOnReceipt === "number") {
          mileage = mileageOnReceipt;
        } else {
          const estimate = estimateMileage(date, knownMileagePoints, {
            startingMileage: bike.startingMileage,
            currentMileage: bike.currentMileage,
            dateAdded: bike.dateAdded,
          });
          mileage = estimate.mileage;
          mileageConfidence = estimate.confidence;
          mileageWarning = estimate.warning;
          mileageNeedsManualEntry = estimate.requiresManualEntry;
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
        const duplicate = findPossibleDuplicate(date, costGbp, committedServiceRecords);
        const record = await createServiceRecord(session.email, {
          bikeId: bike.id, jobType, cost: costGbp, mileage: mileage ?? bike.currentMileage, date, notes,
          attachments: [attachment], needsReview: true, currencyConversion, mileageConfidence, aiDescription,
        });
        committedServiceRecords.push({ id: record.id, date, mileage: mileage ?? bike.currentMileage, cost: costGbp, description: jobLabel });
        createdEntries.push({ id: record.id, category: "service", aiDescription, duplicate, jobType, cost: costGbp, mileage: mileage ?? bike.currentMileage, mileageNeedsManualEntry, date, notes });
        const reminderDefault = JOB_REMINDER_DEFAULTS[jobType];
        if (reminderDefault) {
          await createReminder(session.email, {
            bikeId: bike.id, name: jobLabel, intervalType: reminderDefault.type, intervalValue: reminderDefault.value,
            baseMileage: mileage ?? bike.currentMileage, date, sourceKey: `service:${jobType}`,
          });
        }
        createdCategories.push("service");
      } else if (category === "fuel") {
        const aiDescription = buildAiDescription({ description: description || "Fuel", merchantName, address, city, categoryLabel: "Fuel" });
        const duplicate = findPossibleDuplicate(date, costGbp, committedFuelLogs);
        const litresValue = litres ?? 0;
        const record = await createFuelLog(session.email, {
          bikeId: bike.id, litres: litresValue, cost: costGbp, mileage: mileage ?? bike.currentMileage, date,
          filledToFull: true, attachments: [attachment], needsReview: true, currencyConversion, mileageConfidence, aiDescription,
        });
        committedFuelLogs.push({ id: record.id, date, mileage: mileage ?? bike.currentMileage, cost: costGbp, description: `${litresValue.toFixed(1)}L fill-up` });
        createdEntries.push({ id: record.id, category: "fuel", aiDescription, duplicate, litres: litresValue, cost: costGbp, mileage: mileage ?? bike.currentMileage, mileageNeedsManualEntry, date, filledToFull: true });
        createdCategories.push("fuel");
      } else if (category === "mods") {
        const modCategory = guessModCategory(description) ?? "other-accessory";
        const modNotes = [
          forceReview ? "Currency could not be auto-converted - please check the amount" : null,
          mileageWarning ? `⚠️ ${mileageWarning}` : null,
        ].filter(Boolean).join(" - ");
        const aiDescription = buildAiDescription({ description, merchantName, address, city, categoryLabel: "Parts & Accessories" });
        const duplicate = findPossibleDuplicate(date, costGbp, committedMods);
        const record = await createMod(session.email, {
          bikeId: bike.id, category: modCategory, name: description, cost: costGbp, mileage: mileage ?? bike.currentMileage, date,
          notes: modNotes, attachments: [attachment], needsReview: true, currencyConversion, mileageConfidence, aiDescription,
        });
        committedMods.push({ id: record.id, date, mileage: mileage ?? bike.currentMileage, cost: costGbp, description });
        createdEntries.push({ id: record.id, category: "mods", aiDescription, duplicate, name: description, modCategory, cost: costGbp, mileage: mileage ?? bike.currentMileage, mileageNeedsManualEntry, date, notes: modNotes });
        createdCategories.push("mods");
      } else {
        const billType = guessBillType(description) ?? "insurance";
        const billNotes = forceReview ? `${description} (currency could not be auto-converted - please check the amount)` : description;
        const billLabel = BILL_LABELS[billType] ?? billType;
        const aiDescription = buildAiDescription({ description: billLabel, merchantName, address, city, categoryLabel: "Insurance, tax & MOT" });
        const duplicate = findPossibleDuplicate(date, costGbp, committedBills);
        const record = await createBill(session.email, {
          bikeId: bike.id, billType, cost: costGbp, date, notes: billNotes, attachments: [attachment], needsReview: true, currencyConversion, aiDescription,
        });
        committedBills.push({ id: record.id, date, cost: costGbp, description: billLabel });
        createdEntries.push({ id: record.id, category: "bills", aiDescription, duplicate, billType, cost: costGbp, date, notes: billNotes });
        const reminderDefault = BILL_REMINDER_DEFAULTS[billType];
        if (reminderDefault) {
          await createReminder(session.email, {
            bikeId: bike.id, name: `${billLabel} renewal`, intervalType: reminderDefault.type, intervalValue: reminderDefault.value,
            baseMileage: bike.currentMileage, date, sourceKey: `bill:${billType}`,
          });
        }
        createdCategories.push("bills");
      }
    }

    return NextResponse.json({ createdEntries, createdCount: createdEntries.length, categories: [...new Set(createdCategories)] });
  } catch (err) {
    return NextResponse.json(
      { error: "Something went wrong saving these entries. Please try again.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
