// Place at: src/app/api/tracker/reminders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateReminder, deleteReminder, getReminderById } from "@/lib/tracker/reminder";
import { getPrimaryBike, isBikeReadOnly, BIKE_READ_ONLY_MESSAGE } from "@/lib/tracker/bike";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";
import { parseReminderEdit } from "@/lib/tracker/reminderEdit";

export const dynamic = "force-dynamic";

// "Mark done" - reset the base point to now, so the next occurrence is
// calculated fresh from today/today's mileage. Editing is PUT, below.
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::reminder::`)) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  const bike = await getPrimaryBike(session.email);
  if (bike && isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
  }

  // A permanent (SORN) reminder only ever clears via a fresh DVLA tax
  // check confirming the vehicle is taxed again - see
  // reminder.ts's syncSornReminder. Rejected here too, not just hidden
  // client-side, since this route is otherwise reachable directly.
  const existing = await getReminderById(session.email, id);
  if (existing?.intervalType === "permanent") {
    return NextResponse.json(
      { error: "This reminder clears automatically once the vehicle is confirmed taxed again - it can't be marked done manually." },
      { status: 403 }
    );
  }

  const reminder = await updateReminder(session.email, id, {
    baseMileage: bike?.currentMileage,
    date: new Date().toISOString().slice(0, 10),
  });

  if (!reminder) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  void logImpersonationActivityForCurrentRequest("reminder", id, "update");
  return NextResponse.json({ reminder });
}

// Edit: the reminder's name and main schedule (see reminderEdit.ts). What
// was last done, and any extra "whichever comes first" triggers, stay as
// they are. A switch to a mileage schedule with no mileage on record yet
// counts from the bike's current mileage.
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::reminder::`)) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = parseReminderEdit(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (bike && isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const existing = await getReminderById(session.email, id);
  if (!existing) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }
  if (existing.intervalType === "permanent") {
    return NextResponse.json({ error: "This reminder is managed automatically and can't be edited." }, { status: 403 });
  }

  const { edit } = parsed;
  const reminder = await updateReminder(session.email, id, {
    name: edit.name,
    intervalType: edit.intervalType,
    intervalValue: edit.intervalType === "date" ? undefined : edit.intervalValue,
    exactDate: edit.intervalType === "date" ? edit.exactDate : undefined,
    baseMileage: existing.baseMileage ?? bike?.currentMileage,
  });
  if (!reminder) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  void logImpersonationActivityForCurrentRequest("reminder", id, "update");
  return NextResponse.json({ reminder });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::reminder::`)) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  const bike = await getPrimaryBike(session.email);
  if (bike && isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const existing = await getReminderById(session.email, id);
  if (existing?.intervalType === "permanent") {
    return NextResponse.json(
      { error: "This reminder clears automatically once the vehicle is confirmed taxed again - it can't be deleted manually." },
      { status: 403 }
    );
  }

  await deleteReminder(session.email, id);
  void logImpersonationActivityForCurrentRequest("reminder", id, "delete");
  return NextResponse.json({ ok: true });
}
