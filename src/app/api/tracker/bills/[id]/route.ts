// Place at: src/app/api/tracker/bills/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateBill, deleteBill } from "@/lib/tracker/bill";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { createReminder, deleteRemindersBySourceKey } from "@/lib/tracker/reminder";
import { BILL_LABELS } from "@/lib/tracker/billTypes";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::bill::`)) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { billType, cost, date, notes, attachments, reminder } = body as {
    billType?: string;
    cost?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
    reminder?: {
      intervalType: "mileage" | "months" | "date";
      intervalValue?: number;
      exactDate?: string;
      additionalTriggers?: { intervalType: "mileage" | "months" | "date"; intervalValue?: number; exactDate?: string }[];
    };
  };

  if (!billType || cost == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const bill = await updateBill(session.email, id, {
    billType,
    cost,
    date,
    notes: notes ?? "",
    ...(attachments !== undefined ? { attachments } : {}),
    needsReview: false,
  });
  if (!bill) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  if (reminder) {
    const bike = await getPrimaryBike(session.email);
    if (bike) {
      const sourceKey = `bill:${billType}`;
      await deleteRemindersBySourceKey(session.email, bike.id, sourceKey);
      await createReminder(session.email, {
        bikeId: bike.id,
        name: `${BILL_LABELS[billType] ?? billType} renewal`,
        intervalType: reminder.intervalType,
        intervalValue: reminder.intervalValue,
        exactDate: reminder.exactDate,
        additionalTriggers: reminder.additionalTriggers,
        baseMileage: bike.currentMileage,
        date,
        sourceKey,
      });
    }
  }

  return NextResponse.json({ bill });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::bill::`)) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  await deleteBill(session.email, id);
  return NextResponse.json({ ok: true });
}
