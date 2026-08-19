// Place at: src/app/api/tracker/bike-transfer/request-ownership/route.ts
//
// The reverse of POST /api/tracker/bike-transfer - there, the current
// owner initiates and names a recipient by email. Here, the requester
// initiates and doesn't (and shouldn't) know who the current owner is
// - bike-exists deliberately never revealed that. So this takes a
// registration, not a bikeId/ownerEmail, and re-resolves the target
// itself, the same way bike-exists did, keeping that privacy boundary
// intact rather than trusting whatever the client happens to send.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { findBikeByRegistrationAcrossAccounts, getBike, isBikeReadOnly } from "@/lib/tracker/bike";
import { createBikeTransferRequest, hasActiveTransferRequestForBike } from "@/lib/tracker/bikeTransferRequest";
import { sendIncomingOwnershipRequestEmail } from "@/lib/resend";

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

  const match = await findBikeByRegistrationAcrossAccounts(registration);
  if (!match) {
    return NextResponse.json({ error: "No RoadVerdict record found for that registration." }, { status: 404 });
  }
  if (match.ownerEmail === session.email) {
    return NextResponse.json({ error: "This bike is already on your own account." }, { status: 400 });
  }

  const bike = await getBike(match.ownerEmail, match.bikeId);
  if (!bike || isBikeReadOnly(bike)) {
    // A read-only match shouldn't normally surface here - the lookup
    // this feeds from prefers the live head of a transfer chain over a
    // historical document - but this is the one place a request would
    // actually get created, so it's worth a real check rather than an
    // assumption carried over from elsewhere.
    return NextResponse.json({ error: "This bike is no longer available to request." }, { status: 404 });
  }

  if (await hasActiveTransferRequestForBike(match.ownerEmail, match.bikeId)) {
    return NextResponse.json(
      { error: "This bike already has a request or offer in progress. Try again later." },
      { status: 409 }
    );
  }

  const bikeSummary = { make: bike.make, model: bike.model, year: bike.year, isCustomBuild: !!bike.isCustomBuild };

  await createBikeTransferRequest({
    ownerEmail: match.ownerEmail,
    bikeId: match.bikeId,
    recipientEmail: session.email,
    bikeSummary,
    initiatedBy: "recipient",
  });

  try {
    await sendIncomingOwnershipRequestEmail({
      ownerEmail: match.ownerEmail,
      requesterEmail: session.email,
      bikeSummary,
    });
  } catch (err) {
    // The request document already exists regardless - the owner just
    // won't be notified until they happen to check their dashboard.
    // Worth logging, not worth failing the whole request over, since
    // the request itself is the part that actually matters.
    console.error("Incoming ownership request email failed to send:", err);
  }

  return NextResponse.json({ ok: true });
}
