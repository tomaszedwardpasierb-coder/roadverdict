// Place at: src/app/api/cars/car-transfer/route.ts
// Car mirror of api/tracker/bike-transfer/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryCar, isCarReadOnly } from "@/lib/tracker/car";
import { createCarTransferRequest, getPendingCarTransferRequestsForOwner, hasActiveCarTransferRequestForCar } from "@/lib/tracker/carTransferRequest";
import { sendCarTransferOfferEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const requests = await getPendingCarTransferRequestsForOwner(session.email);
  return NextResponse.json({ requests });
}

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
  const { recipientEmail, includeRecords } = body as { recipientEmail?: string; includeRecords?: boolean };
  const cleanedRecipient = recipientEmail?.trim().toLowerCase();
  if (!cleanedRecipient || !cleanedRecipient.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (cleanedRecipient === session.email) {
    return NextResponse.json({ error: "You can't start a handover to your own account." }, { status: 400 });
  }

  const car = await getPrimaryCar(session.email);
  if (!car) {
    return NextResponse.json({ error: "No car found for this account." }, { status: 404 });
  }
  if (isCarReadOnly(car)) {
    return NextResponse.json({ error: "This car has already been transferred and can't be offered again." }, { status: 403 });
  }
  if (await hasActiveCarTransferRequestForCar(session.email, car.id)) {
    return NextResponse.json(
      { error: "This car already has a request or offer in progress. Try again once it's resolved." },
      { status: 409 }
    );
  }

  const { doc, token } = await createCarTransferRequest({
    ownerEmail: session.email,
    carId: car.id,
    recipientEmail: cleanedRecipient,
    carSummary: { make: car.make, model: car.model, year: car.year, isCustomBuild: !!car.isCustomBuild },
    includeRecords: includeRecords ?? true,
  });

  try {
    await sendCarTransferOfferEmail({
      recipientEmail: cleanedRecipient,
      ownerEmail: session.email,
      carSummary: doc.carSummary,
      token,
    });
  } catch (err) {
    console.error("Car transfer offer email failed to send:", err);
    return NextResponse.json(
      { error: "The offer was created, but the email couldn't be sent. Try again in a moment." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, requestId: doc.id });
}
