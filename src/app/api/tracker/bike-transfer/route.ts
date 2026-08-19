// Place at: src/app/api/tracker/bike-transfer/route.ts
//
// Owner-initiated side of the digital passport handover flow. Operates
// on the signed-in account's primary bike, same convention every other
// write route in this app already follows - no bike-switcher UI exists
// yet, so there's never an ambiguous "which bike" to resolve.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike, isBikeReadOnly } from "@/lib/tracker/bike";
import { createBikeTransferRequest, getPendingTransferRequestsForOwner, hasActiveTransferRequestForBike } from "@/lib/tracker/bikeTransferRequest";
import { sendBikeTransferOfferEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const requests = await getPendingTransferRequestsForOwner(session.email);
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
  const { recipientEmail } = body as { recipientEmail?: string };
  const cleanedRecipient = recipientEmail?.trim().toLowerCase();
  if (!cleanedRecipient || !cleanedRecipient.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (cleanedRecipient === session.email) {
    return NextResponse.json({ error: "You can't start a handover to your own account." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }
  if (isBikeReadOnly(bike)) {
    return NextResponse.json({ error: "This bike has already been transferred and can't be offered again." }, { status: 403 });
  }
  if (await hasActiveTransferRequestForBike(session.email, bike.id)) {
    return NextResponse.json(
      { error: "This bike already has a request or offer in progress. Try again once it's resolved." },
      { status: 409 }
    );
  }

  const { doc, token } = await createBikeTransferRequest({
    ownerEmail: session.email,
    bikeId: bike.id,
    recipientEmail: cleanedRecipient,
    bikeSummary: { make: bike.make, model: bike.model, year: bike.year, isCustomBuild: !!bike.isCustomBuild },
  });

  try {
    await sendBikeTransferOfferEmail({
      recipientEmail: cleanedRecipient,
      ownerEmail: session.email,
      bikeSummary: doc.bikeSummary,
      token,
    });
  } catch (err) {
    // The offer document still exists even if the email fails to send -
    // worth surfacing rather than silently succeeding, since without the
    // email the recipient has no way to find this offer at all.
    console.error("Bike transfer offer email failed to send:", err);
    return NextResponse.json(
      { error: "The offer was created, but the email couldn't be sent. Try again in a moment." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, requestId: doc.id });
}
