// Place at: src/app/api/tracker/reminders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateReminder, deleteReminder } from "@/lib/tracker/reminder";
import { getBike } from "@/lib/tracker/bike";

export const dynamic = "force-dynamic";

// "Mark done" - reset the base point to now, so the next occurrence is
// calculated fresh from today/today's mileage. There is no separate edit
// form for reminders, matching the local prototype's scope.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::reminder::`)) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  const bike = await getBike(session.email);
  const reminder = await updateReminder(session.email, id, {
    baseMileage: bike?.currentMileage,
    date: new Date().toISOString().slice(0, 10),
  });

  if (!reminder) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  return NextResponse.json({ reminder });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::reminder::`)) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }

  await deleteReminder(session.email, id);
  return NextResponse.json({ ok: true });
}
