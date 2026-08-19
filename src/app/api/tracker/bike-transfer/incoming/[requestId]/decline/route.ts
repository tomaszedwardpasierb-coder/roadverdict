// Place at: src/app/api/tracker/bike-transfer/incoming/[requestId]/decline/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBikeTransferRequestById, decideBikeTransferRequest } from "@/lib/tracker/bikeTransferRequest";
import { sendOwnershipRequestDeclinedEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { requestId: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const doc = await getBikeTransferRequestById(params.requestId, session.email);
  if (!doc) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (doc.initiatedBy !== "recipient") {
    return NextResponse.json({ error: "This request can't be declined from here." }, { status: 400 });
  }
  if (doc.status !== "pending") {
    return NextResponse.json({ error: `This request has already been ${doc.status}.` }, { status: 409 });
  }

  await decideBikeTransferRequest(doc.id, doc.ownerEmail, "declined");

  try {
    await sendOwnershipRequestDeclinedEmail({ requesterEmail: doc.recipientEmail, bikeSummary: doc.bikeSummary });
  } catch (err) {
    console.error("Ownership request declined-notification email failed to send:", err);
  }

  return NextResponse.json({ ok: true });
}
