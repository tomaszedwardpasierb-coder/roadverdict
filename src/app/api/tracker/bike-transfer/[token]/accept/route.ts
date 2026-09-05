// Place at: src/app/api/tracker/bike-transfer/[token]/accept/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBikeTransferRequestByToken, decideBikeTransferRequest } from "@/lib/tracker/bikeTransferRequest";
import { transferBike } from "@/lib/tracker/bikeTransfer";
import { sendBikeTransferAcceptedEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first, using the same email address this offer was sent to." }, { status: 401 });
  }

  const doc = await getBikeTransferRequestByToken(params.token);
  if (!doc) {
    return NextResponse.json({ error: "This offer doesn't exist or has expired." }, { status: 404 });
  }
  if (doc.status !== "pending") {
    return NextResponse.json({ error: `This offer has already been ${doc.status}.` }, { status: 409 });
  }
  // The token alone isn't sufficient proof of identity for the one
  // genuinely consequential action in this flow - links get forwarded,
  // accidentally shared, or sit in someone else's inbox. Only the
  // account this offer was actually addressed to can accept it.
  if (session.email !== doc.recipientEmail) {
    return NextResponse.json(
      { error: `This offer was sent to ${doc.recipientEmail}. Sign in with that account to accept it.` },
      { status: 403 }
    );
  }

  const result = await transferBike(doc.ownerEmail, doc.bikeId, session.email, doc.includeRecords ?? true);
  if (!result.ok) {
    switch (result.reason) {
      case "bike_not_found":
        return NextResponse.json({ error: "This bike is no longer on the original account." }, { status: 404 });
      case "already_transferred":
        return NextResponse.json({ error: "This bike has already been transferred elsewhere." }, { status: 409 });
      case "same_owner":
        return NextResponse.json({ error: "You can't accept a handover to your own account." }, { status: 400 });
      case "recipient_limit_reached":
        return NextResponse.json(
          { error: `You already have the maximum of ${result.limit} bikes. Remove one first, then try again.` },
          { status: 403 }
        );
      case "recipient_already_has_bike":
        return NextResponse.json(
          { error: "You already have a separate bike on your account with this same registration - resolve that one first (most likely by deleting it, if it was a fresh start for this same bike), then try accepting again." },
          { status: 409 }
        );
    }
  }

  await decideBikeTransferRequest(doc.id, doc.ownerEmail, "accepted");

  try {
    await sendBikeTransferAcceptedEmail({
      ownerEmail: doc.ownerEmail,
      recipientEmail: doc.recipientEmail,
      bikeSummary: doc.bikeSummary,
    });
  } catch (err) {
    // The transfer itself already succeeded and is the part that
    // actually matters - a failed notification email isn't worth
    // failing the whole request over, just worth knowing about.
    console.error("Bike transfer accepted-notification email failed to send:", err);
  }

  return NextResponse.json({ ok: true, newBike: result.newBike });
}
