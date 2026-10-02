// Place at: src/app/api/cars/car-reminders/[id]/route.ts
//
// PATCH here is a fixed "mark done" action and ignores the request body;
// PUT edits the reminder (name and schedule).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateCarReminder, deleteCarReminder, getCarReminderById } from "@/lib/tracker/carReminder";
import { getPrimaryCar, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";
import { parseReminderEdit } from "@/lib/tracker/reminderEdit";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carReminder::`)) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  const car = await getPrimaryCar(session.email);
  if (car && isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const existing = await getCarReminderById(session.email, id);
  if (existing?.intervalType === "permanent") {
    return NextResponse.json(
      { error: "This reminder clears automatically once the vehicle is confirmed taxed again - it can't be marked done manually." },
      { status: 403 }
    );
  }

  const reminder = await updateCarReminder(session.email, id, {
    baseMileage: car?.currentMileage,
    date: new Date().toISOString().slice(0, 10),
  });
  if (!reminder) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  void logImpersonationActivityForCurrentRequest("carReminder", id, "update");
  return NextResponse.json({ reminder });
}

// Edit: the reminder's name and main schedule (see reminderEdit.ts). What
// was last done, and any extra "whichever comes first" triggers, stay as
// they are. A switch to a mileage schedule with no mileage on record yet
// counts from the car's current mileage.
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carReminder::`)) {
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

  const car = await getPrimaryCar(session.email);
  if (car && isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const existing = await getCarReminderById(session.email, id);
  if (!existing) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }
  if (existing.intervalType === "permanent") {
    return NextResponse.json({ error: "This reminder is managed automatically and can't be edited." }, { status: 403 });
  }

  const { edit } = parsed;
  const reminder = await updateCarReminder(session.email, id, {
    name: edit.name,
    intervalType: edit.intervalType,
    intervalValue: edit.intervalType === "date" ? undefined : edit.intervalValue,
    exactDate: edit.intervalType === "date" ? edit.exactDate : undefined,
    baseMileage: existing.baseMileage ?? car?.currentMileage,
  });
  if (!reminder) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  void logImpersonationActivityForCurrentRequest("carReminder", id, "update");
  return NextResponse.json({ reminder });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carReminder::`)) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  const car = await getPrimaryCar(session.email);
  if (car && isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const existing = await getCarReminderById(session.email, id);
  if (existing?.intervalType === "permanent") {
    return NextResponse.json(
      { error: "This reminder clears automatically once the vehicle is confirmed taxed again - it can't be deleted manually." },
      { status: 403 }
    );
  }

  await deleteCarReminder(session.email, id);
  void logImpersonationActivityForCurrentRequest("carReminder", id, "delete");
  return NextResponse.json({ ok: true });
}
