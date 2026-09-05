// Place at: src/app/api/tracker/reminders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateReminder, deleteReminder } from "@/lib/tracker/reminder";
import { getPrimaryBike, isBikeReadOnly, BIKE_READ_ONLY_MESSAGE } from "@/lib/tracker/bike";

export const dynamic = "force-dynamic";

// "Mark done" - reset the base point to now, so the next occurrence is
// calculated fresh from today/today's mileage. There is no separate edit
// form for reminders, matching the local prototype's scope.
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
  const reminder = await updateReminder(session.email, id, {
    baseMileage: bike?.currentMileage,
    date: new Date().toISOString().slice(0, 10),
  });

  if (!reminder) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

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

  await deleteReminder(session.email, id);
  return NextResponse.json({ ok: true });
}
