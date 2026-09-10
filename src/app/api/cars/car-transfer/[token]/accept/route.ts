// Place at: src/app/api/cars/car-transfer/[token]/accept/route.ts
// Car mirror of api/tracker/bike-transfer/[token]/accept/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCarTransferRequestByToken, decideCarTransferRequest } from "@/lib/tracker/carTransferRequest";
import { transferCar } from "@/lib/tracker/carTransfer";
import { sendCarTransferAcceptedEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first, using the same email address this offer was sent to." }, { status: 401 });
  }

  const doc = await getCarTransferRequestByToken(params.token);
  if (!doc) {
    return NextResponse.json({ error: "This offer doesn't exist or has expired." }, { status: 404 });
  }
  if (doc.status !== "pending") {
    return NextResponse.json({ error: `This offer has already been ${doc.status}.` }, { status: 409 });
  }
  if (session.email !== doc.recipientEmail) {
    return NextResponse.json(
      { error: `This offer was sent to ${doc.recipientEmail}. Sign in with that account to accept it.` },
      { status: 403 }
    );
  }

  const result = await transferCar(doc.ownerEmail, doc.carId, session.email, doc.includeRecords ?? true);
  if (!result.ok) {
    switch (result.reason) {
      case "car_not_found":
        return NextResponse.json({ error: "This car is no longer on the original account." }, { status: 404 });
      case "already_transferred":
        return NextResponse.json({ error: "This car has already been transferred elsewhere." }, { status: 409 });
      case "same_owner":
        return NextResponse.json({ error: "You can't accept a handover to your own account." }, { status: 400 });
      case "recipient_limit_reached":
        return NextResponse.json(
          { error: `You already have the maximum of ${result.limit} vehicles. Remove one first, then try again.` },
          { status: 403 }
        );
      case "recipient_already_has_car":
        return NextResponse.json(
          { error: "You already have a separate car on your account with this same registration - resolve that one first (most likely by deleting it, if it was a fresh start for this same car), then try accepting again." },
          { status: 409 }
        );
    }
  }

  await decideCarTransferRequest(doc.id, doc.ownerEmail, "accepted");

  try {
    await sendCarTransferAcceptedEmail({
      ownerEmail: doc.ownerEmail,
      recipientEmail: doc.recipientEmail,
      carSummary: doc.carSummary,
    });
  } catch (err) {
    console.error("Car transfer accepted-notification email failed to send:", err);
  }

  return NextResponse.json({ ok: true, newCar: result.newCar });
}
