// Place at: src/app/api/cars/car-transfer/request-ownership/route.ts
// Car mirror of api/tracker/bike-transfer/request-ownership/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { findCarByRegistrationAcrossAccounts, getCarById, isCarReadOnly } from "@/lib/tracker/car";
import { createCarTransferRequest, hasActiveCarTransferRequestForCar } from "@/lib/tracker/carTransferRequest";
import { sendIncomingCarOwnershipRequestEmail } from "@/lib/resend";

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
  const { registration } = body as { registration?: string };
  if (!registration || !registration.trim()) {
    return NextResponse.json({ error: "Registration number is required." }, { status: 400 });
  }

  const match = await findCarByRegistrationAcrossAccounts(registration);
  if (!match) {
    return NextResponse.json({ error: "No RoadVerdict record found for that registration." }, { status: 404 });
  }
  if (match.ownerEmail === session.email) {
    return NextResponse.json({ error: "This car is already on your own account." }, { status: 400 });
  }

  const car = await getCarById(match.ownerEmail, match.carId);
  if (!car || isCarReadOnly(car)) {
    return NextResponse.json({ error: "This car is no longer available to request." }, { status: 404 });
  }

  if (await hasActiveCarTransferRequestForCar(match.ownerEmail, match.carId)) {
    return NextResponse.json(
      { error: "This car already has a request or offer in progress. Try again later." },
      { status: 409 }
    );
  }

  const carSummary = { make: car.make, model: car.model, year: car.year, isCustomBuild: !!car.isCustomBuild };

  await createCarTransferRequest({
    ownerEmail: match.ownerEmail,
    carId: match.carId,
    recipientEmail: session.email,
    carSummary,
    initiatedBy: "recipient",
  });

  try {
    await sendIncomingCarOwnershipRequestEmail({
      ownerEmail: match.ownerEmail,
      requesterEmail: session.email,
      carSummary,
    });
  } catch (err) {
    console.error("Incoming car ownership request email failed to send:", err);
  }

  return NextResponse.json({ ok: true });
}
