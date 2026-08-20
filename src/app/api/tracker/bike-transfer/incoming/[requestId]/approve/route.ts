// Place at: src/app/api/tracker/bike-transfer/incoming/[requestId]/approve/route.ts
//
// The owner's side of a recipient-initiated request - deliberately
// session-based rather than token-based, unlike the [token]/accept
// route a recipient uses for an owner-initiated offer. The owner is
// always signed in already when acting here (this is reached from
// their own dashboard), so there's no need for a public, no-signin
// token the way an emailed offer link needs one.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBikeTransferRequestById, decideBikeTransferRequest } from "@/lib/tracker/bikeTransferRequest";
import { transferBike } from "@/lib/tracker/bikeTransfer";
import { sendOwnershipRequestApprovedEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { requestId: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // No body at all is a legitimate, expected case here (not an error) -
  // defaults to including records, matching the feature's own default.
  let includeRecords = true;
  try {
    const body = (await request.json()) as { includeRecords?: boolean };
    if (typeof body.includeRecords === "boolean") includeRecords = body.includeRecords;
  } catch {
    // No body sent, or not valid JSON - fall through with the default.
  }

  const doc = await getBikeTransferRequestById(params.requestId, session.email);
  if (!doc) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  // Belt and braces beyond the partition-key read above - this route
  // only makes sense for a request someone else initiated toward this
  // account. An owner-initiated offer is accepted via the token-based
  // route a recipient uses instead, never this one.
  if (doc.initiatedBy !== "recipient") {
    return NextResponse.json({ error: "This request can't be approved from here." }, { status: 400 });
  }
  if (doc.status !== "pending") {
    return NextResponse.json({ error: `This request has already been ${doc.status}.` }, { status: 409 });
  }

  const result = await transferBike(doc.ownerEmail, doc.bikeId, doc.recipientEmail, includeRecords);
  if (!result.ok) {
    switch (result.reason) {
      case "bike_not_found":
        return NextResponse.json({ error: "This bike is no longer on your account." }, { status: 404 });
      case "already_transferred":
        return NextResponse.json({ error: "This bike has already been transferred elsewhere." }, { status: 409 });
      case "same_owner":
        return NextResponse.json({ error: "That account already owns this bike." }, { status: 400 });
      case "recipient_limit_reached":
        return NextResponse.json(
          { error: `The requester already has the maximum of ${result.limit} bikes and can't accept this right now.` },
          { status: 403 }
        );
    }
  }

  await decideBikeTransferRequest(doc.id, doc.ownerEmail, "accepted");

  try {
    await sendOwnershipRequestApprovedEmail({ requesterEmail: doc.recipientEmail, bikeSummary: doc.bikeSummary });
  } catch (err) {
    // Same reasoning as everywhere else this session - the transfer
    // itself already succeeded, which is the part that actually
    // matters. A failed notification isn't worth failing the request.
    console.error("Ownership request approved-notification email failed to send:", err);
  }

  return NextResponse.json({ ok: true, newBike: result.newBike });
}
