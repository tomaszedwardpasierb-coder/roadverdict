// Place at: src/app/api/cars/car-fines/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createCarFine } from "@/lib/tracker/carFine";
import { getPrimaryCar, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
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

  const { fineType, cost, date, notes, attachments } = body as {
    fineType?: string;
    cost?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
  };

  if (!fineType || cost == null || !date) {
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

  const fine = await createCarFine(session.email, { carId: car.id, fineType, cost, date, notes: notes ?? "", attachments });

  return NextResponse.json({ fine });
}
