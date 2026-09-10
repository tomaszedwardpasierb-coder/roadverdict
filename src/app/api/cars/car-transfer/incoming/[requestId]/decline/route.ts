// Place at: src/app/api/cars/car-transfer/incoming/[requestId]/decline/route.ts
// Car mirror of api/tracker/bike-transfer/incoming/[requestId]/decline/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCarTransferRequestById, decideCarTransferRequest } from "@/lib/tracker/carTransferRequest";
import { sendCarOwnershipRequestDeclinedEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, props: { params: Promise<{ requestId: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const doc = await getCarTransferRequestById(params.requestId, session.email);
  if (!doc) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (doc.initiatedBy !== "recipient") {
    return NextResponse.json({ error: "This request can't be declined from here." }, { status: 400 });
  }
  if (doc.status !== "pending") {
    return NextResponse.json({ error: `This request has already been ${doc.status}.` }, { status: 409 });
  }

  await decideCarTransferRequest(doc.id, doc.ownerEmail, "declined");

  try {
    await sendCarOwnershipRequestDeclinedEmail({ requesterEmail: doc.recipientEmail, carSummary: doc.carSummary });
  } catch (err) {
    console.error("Car ownership request declined-notification email failed to send:", err);
  }

  return NextResponse.json({ ok: true });
}
