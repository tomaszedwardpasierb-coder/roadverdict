// Place at: src/app/api/cars/car-bills/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createCarBill } from "@/lib/tracker/carBill";
import { getPrimaryCar, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { createCarReminder, deleteCarRemindersBySourceKey } from "@/lib/tracker/carReminder";
import { CAR_BILL_LABELS } from "@/lib/tracker/carBillTypes";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
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

  const { billType, cost, date, notes, reminder, attachments } = body as {
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
  };

  if (!billType || cost == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const car = await getPrimaryCar(session.email);
  if (!car) {
    return NextResponse.json({ error: "No car found for this account." }, { status: 404 });
  }
  if (isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  if (isBeforeProduction(date, car)) {
    return NextResponse.json({ error: `This date is before ${car.year}, when this car was made.` }, { status: 400 });
  }

  const bill = await createCarBill(session.email, {
    carId: car.id,
    billType,
    cost,
    date,
    notes: notes ?? "",
    attachments,
  });

  if (reminder) {
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
