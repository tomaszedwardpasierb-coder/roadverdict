// Place at: src/app/api/tracker/services/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateServiceRecord, deleteServiceRecord, getServiceRecords, type ServiceRecordDoc } from "@/lib/tracker/serviceRecord";
import { getPrimaryBike, updateBikeMileage } from "@/lib/tracker/bike";
import { createReminder, deleteRemindersBySourceKey } from "@/lib/tracker/reminder";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { findMileageConflict, describeMileageConflict } from "@/lib/tracker/mileageConflict";
import { getTrackerDocById, type Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::service::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { jobType, cost, mileage, date, notes, attachments, reminder, batchHints, mileageAcknowledged } = body as {
    jobType?: string;
    cost?: number;
    mileage?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
    reminder?: {
      intervalType: "mileage" | "months" | "date";
      intervalValue?: number;
      exactDate?: string;
      additionalTriggers?: { intervalType: "mileage" | "months" | "date"; intervalValue?: number; exactDate?: string }[];
    };
    // Optional - only ever sent by the review queue: other receipts in
    // the same scan batch that have a mileage actually printed on them,
    // even if they haven't been reached/committed yet. An exact reading
    // is trustworthy regardless of processing order, so it's included in
    // this check the same as anything already in the database.
    batchHints?: { date: string; mileage: number }[];
    mileageAcknowledged?: boolean;
  };

  if (!jobType || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  // Read the existing record first so an estimated/interpolated mileage
  // can be correctly transitioned to "confirmed" (reviewed by a human),
  // rather than silently surviving forever - which is exactly the bug
  // that was happening before this check existed, since the update below
  // would otherwise never mention this field at all.
  const existing = await getTrackerDocById<ServiceRecordDoc>(session.email, id);
  const nextMileageConfidence =
    existing?.mileageConfidence === "estimated" || existing?.mileageConfidence === "interpolated"
      ? "confirmed"
      : existing?.mileageConfidence;

  // Same check as creating a new record, run again here - an edit can
  // just as easily introduce a chronological inconsistency as a fresh
  // entry can. Hard rejection, not a soft flag: a human is right here
  // to fix it immediately, so there's no reason to let an inconsistent
  // save through and hope it gets noticed later.
  const bikeId = existing?.bikeId;
  const [otherRecords, otherFuelLogs, otherMods] = bikeId
    ? await Promise.all([getServiceRecords(session.email, bikeId), getFuelLogs(session.email, bikeId), getMods(session.email, bikeId)])
    : [[], [], []];
  const conflict = findMileageConflict(date, mileage, id, [
    ...otherRecords.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage })),
    ...otherFuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage })),
    ...otherMods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage })),
    ...(batchHints ?? []),
  ]);
  if (conflict && !mileageAcknowledged) {
    return NextResponse.json({ error: describeMileageConflict(conflict) }, { status: 409 });
  }

  const record = await updateServiceRecord(session.email, id, {
    jobType,
    cost,
    mileage,
    date,
    notes: notes ?? "",
    // Only included when the caller actually sent one - an explicit
    // `attachments: undefined` here would still overwrite the existing
    // value during the database merge (a present key beats an absent
    // one, even when its value is undefined), which is exactly the bug
    // that was silently wiping every attachment saved through the
    // review queue, which deliberately omits this field.
    ...(attachments !== undefined ? { attachments } : {}),
    needsReview: false,
    mileageConfidence: nextMileageConfidence,
    mileageConflictWarning: null,
  });
  if (!record) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const bike = await getPrimaryBike(session.email);
  if (bike && mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, bike.id, mileage);
  }

  // Setting a reminder while editing works the same way it does when
  // first logging the job - same sourceKey convention, so it replaces
  // any existing reminder for this job type rather than duplicating one.
  if (reminder && bike) {
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

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::service::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  await deleteServiceRecord(session.email, id);
  return NextResponse.json({ ok: true });
}
