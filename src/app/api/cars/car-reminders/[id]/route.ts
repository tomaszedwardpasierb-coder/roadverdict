// Place at: src/app/api/cars/car-reminders/[id]/route.ts
//
// PATCH here is a fixed "mark done" action, not a general edit - there's
// no separate car-reminder edit form, same as the motorcycle version.
// It deliberately ignores the request body entirely.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateCarReminder, deleteCarReminder, getCarReminderById } from "@/lib/tracker/carReminder";
import { getPrimaryCar, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";

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
