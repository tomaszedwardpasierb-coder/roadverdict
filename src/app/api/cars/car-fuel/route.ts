// Place at: src/app/api/cars/car-fuel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createCarFuelLog, getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getPrimaryCar, updateCarMileage, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarMods } from "@/lib/tracker/carMod";
import { checkMileageConsistency, describeMileageCheck } from "@/lib/tracker/mileageCheck";
import { checkFullTankPlausibility, describeImplausibleFill } from "@/lib/tracker/fuelPlausibility";
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

  const { litres, kwh, cost, mileage, date, filledToFull, attachments, mileageAcknowledged } = body as {
    litres?: number;
    kwh?: number;
    cost?: number;
    mileage?: number;
    date?: string;
    filledToFull?: boolean;
    attachments?: Attachment[];
    mileageAcknowledged?: boolean;
  };

  const car = await getPrimaryCar(session.email);
  if (!car) {
    return NextResponse.json({ error: "No car found for this account." }, { status: 404 });
  }

  // Which field is required depends on the car's own fuelType - litres
  // for anything with an engine, kwh for a charging session. Never both:
  // that split is what CarFuelLogDoc's own shape already encodes.
  const isElectric = car.fuelType === "electric";
  const amount = isElectric ? kwh : litres;
  if (amount == null || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  if (isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  if (isBeforeProduction(date, car)) {
    return NextResponse.json({ error: `This date is before ${car.year}, when this car was made.` }, { status: 400 });
  }

  const [otherRecords, otherFuelLogs, otherMods] = await Promise.all([
    getCarServiceRecords(session.email, car.id),
    getCarFuelLogs(session.email, car.id),
    getCarMods(session.email, car.id),
  ]);
  const mileageResult = checkMileageConsistency(
    mileage,
    date,
    [
      ...otherRecords.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage })),
      ...otherFuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage })),
      ...otherMods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage })),
    ],
    car.currentMileage
  );
  if (mileageResult.status === "blocked" || (mileageResult.status === "warning" && !mileageAcknowledged)) {
    return NextResponse.json({ error: describeMileageCheck(mileageResult) }, { status: 409 });
  }

  // Litres-vs-tank-capacity plausibility (checkLitresPlausibility) is
  // deliberately NOT run here - CarDoc carries no tankCapacityLitres
  // (out of scope, see the ADR), and that check's own fallback default
  // is sized for a motorcycle tank (~16L), which would wrongly flag an
  // entirely normal car fill-up as "more than this car's tank can hold".
  // checkFullTankPlausibility below is capacity-independent (an implied-
  // mpg sanity check against distance since the last full tank), so it
  // stays - same reasoning already applied in commitCarReceiptItem.ts.
  if (!isElectric && filledToFull) {
    const fillCheck = checkFullTankPlausibility(
      amount,
      mileage,
      otherFuelLogs.filter((f) => !f.mileageConfidence || f.mileageConfidence === "confirmed").map((f) => ({ mileage: f.mileage }))
    );
    if (fillCheck && !fillCheck.plausible) {
      return NextResponse.json({ error: describeImplausibleFill(fillCheck, amount) }, { status: 409 });
    }
  }

  const log = await createCarFuelLog(session.email, {
    carId: car.id,
    fuelType: car.fuelType,
    litres: isElectric ? undefined : amount,
    kwh: isElectric ? amount : undefined,
    cost,
    mileage,
    date,
    filledToFull: isElectric ? undefined : filledToFull,
    attachments,
  });

  if (mileage > car.currentMileage) {
    await updateCarMileage(session.email, car.id, mileage);
  }

  return NextResponse.json({ log });
}
