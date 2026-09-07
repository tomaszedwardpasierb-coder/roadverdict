// Place at: src/app/api/cars/car-bills/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateCarBill, deleteCarBill, type CarBillDoc } from "@/lib/tracker/carBill";
import { getCarById, getPrimaryCar, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { createCarReminder, deleteCarRemindersBySourceKey } from "@/lib/tracker/carReminder";
import { CAR_BILL_LABELS } from "@/lib/tracker/carBillTypes";
import { getTrackerDocById, type Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carBill::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { billType, cost, date, notes, reminder, attachments, mileage } = body as {
    billType?: string;
    cost?: number;
    date?: string;
    notes?: string;
    reminder?: {
      intervalType: "mileage" | "months" | "date";
      intervalValue?: number;
      exactDate?: string;
      additionalTriggers?: { intervalType: "mileage" | "months" | "date"; intervalValue?: number; exactDate?: string }[];
    };
    attachments?: Attachment[];
    mileage?: number;
  };

  if (!billType || cost == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  // Fetched before the save so it can be reused for the reminder step
  // below without a second call - same convention as the bike route.
  const car = await getPrimaryCar(session.email);
  if (car && isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const bill = await updateCarBill(session.email, id, {
    billType,
    cost,
    date,
    notes: notes ?? "",
    ...(attachments !== undefined ? { attachments } : {}),
    needsReview: false,
    ...(mileage !== undefined ? { mileage } : {}),
  });
  if (!bill) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  if (reminder && car) {
    const sourceKey = `carBill:${billType}`;
    await deleteCarRemindersBySourceKey(session.email, car.id, sourceKey);
    await createCarReminder(session.email, {
      carId: car.id,
      name: `${CAR_BILL_LABELS[billType] ?? billType} renewal`,
      intervalType: reminder.intervalType,
      intervalValue: reminder.intervalValue,
      exactDate: reminder.exactDate,
      additionalTriggers: reminder.additionalTriggers,
      baseMileage: car.currentMileage,
      date,
      sourceKey,
    });
  }

  return NextResponse.json({ bill });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carBill::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const existing = await getTrackerDocById<CarBillDoc>(session.email, id);
  if (existing?.carId) {
    const car = await getCarById(session.email, existing.carId);
    if (car && isCarReadOnly(car)) {
      return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
    }
  }

  await deleteCarBill(session.email, id);
  return NextResponse.json({ ok: true });
}
