// Place at: src/app/api/tracker/services/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createServiceRecord, getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getPrimaryBike, updateBikeMileage, isBikeReadOnly, BIKE_READ_ONLY_MESSAGE } from "@/lib/tracker/bike";
import { createReminder, deleteRemindersBySourceKey } from "@/lib/tracker/reminder";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { checkMileageConsistency, describeMileageCheck } from "@/lib/tracker/mileageCheck";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { jobType, cost, mileage, date, notes, reminder, attachments, mileageAcknowledged } = body as {
    jobType?: string;
    cost?: number;
    mileage?: number;
    date?: string;
    notes?: string;
    reminder?: {
      intervalType: "mileage" | "months" | "date";
      intervalValue?: number;
      exactDate?: string;
      additionalTriggers?: { intervalType: "mileage" | "months" | "date"; intervalValue?: number; exactDate?: string }[];
    };
    attachments?: Attachment[];
    mileageAcknowledged?: boolean;
  };

  if (!jobType || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }
  if (isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
  }

  if (isBeforeProduction(date, bike)) {
    return NextResponse.json({ error: `This date is before ${bike.year}, when this bike was made.` }, { status: 400 });
  }

  // Catch a chronologically-inconsistent mileage the moment it's saved
  // rather than waiting for the periodic audit tool to find it later -
  // never blocks the save (a rare genuine case, like an odometer
  // replacement, is still allowed), just flags it immediately through
  // the same review mechanism AI-scanned entries already use.
  const [otherRecords, otherFuelLogs, otherMods] = await Promise.all([
    getServiceRecords(session.email, bike.id),
    getFuelLogs(session.email, bike.id),
    getMods(session.email, bike.id),
  ]);
  const mileageResult = checkMileageConsistency(
    mileage,
    date,
    [
      ...otherRecords.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage })),
      ...otherFuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage })),
      ...otherMods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage })),
    ],
    bike.currentMileage
  );
  // "blocked" is never overridable, regardless of what the client
  // sends - the old system's mileageAcknowledged flag could only ever
  // bypass a single, undifferentiated conflict, meaning a clever or
  // buggy client could acknowledge past a "today, but lower than
  // current mileage" case even though the UI never offers that option.
  // Enforcing the distinction server-side, not just trusting the
  // client's own UI to have hidden the checkbox, closes that gap.
  if (mileageResult.status === "blocked" || (mileageResult.status === "warning" && !mileageAcknowledged)) {
    return NextResponse.json({ error: describeMileageCheck(mileageResult) }, { status: 409 });
  }

  const record = await createServiceRecord(session.email, {
    bikeId: bike.id,
    jobType,
    cost,
    mileage,
    date,
    notes: notes ?? "",
    attachments,
  });

  if (mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, bike.id, mileage);
  }

  if (reminder) {
    const sourceKey = `service:${jobType}`;
    await deleteRemindersBySourceKey(session.email, bike.id, sourceKey);
    await createReminder(session.email, {
      bikeId: bike.id,
      name: JOB_LABELS[jobType] ?? jobType,
      intervalType: reminder.intervalType,
      intervalValue: reminder.intervalValue,
      exactDate: reminder.exactDate,
      additionalTriggers: reminder.additionalTriggers,
      baseMileage: mileage,
      date,
      sourceKey,
    });
  }

  return NextResponse.json({ record });
}
