// Place at: src/app/api/cars/car-reminders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createCarReminder, deleteCarRemindersBySourceKey } from "@/lib/tracker/carReminder";
import { getPrimaryCar, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";

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

  const { name, intervalType, intervalValue, exactDate, baseMileage, date, sourceKey } = body as {
    name?: string;
    intervalType?: "mileage" | "months" | "date";
    intervalValue?: number;
    exactDate?: string;
    baseMileage?: number;
    date?: string;
    sourceKey?: string;
  };

  if (!name || !intervalType || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }
  if (intervalType !== "date" && intervalValue == null) {
    return NextResponse.json({ error: "Please enter an interval." }, { status: 400 });
  }
  if (intervalType === "date" && !exactDate) {
    return NextResponse.json({ error: "Please pick a date." }, { status: 400 });
  }

  const car = await getPrimaryCar(session.email);
  if (!car) {
    return NextResponse.json({ error: "No car found for this account." }, { status: 404 });
  }
  if (isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  if (sourceKey) {
    await deleteCarRemindersBySourceKey(session.email, car.id, sourceKey);
  }

  const reminder = await createCarReminder(session.email, {
    carId: car.id,
    name,
    intervalType,
    intervalValue,
    exactDate,
    baseMileage,
    date,
    sourceKey,
  });

  return NextResponse.json({ reminder });
}
