// Place at: src/app/api/cars/car-transfer/incoming/[requestId]/approve/route.ts
// Car mirror of api/tracker/bike-transfer/incoming/[requestId]/approve/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCarTransferRequestById, decideCarTransferRequest } from "@/lib/tracker/carTransferRequest";
import { transferCar } from "@/lib/tracker/carTransfer";
import { sendCarOwnershipRequestApprovedEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, props: { params: Promise<{ requestId: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let includeRecords = true;
  try {
    const body = (await request.json()) as { includeRecords?: boolean };
    if (typeof body.includeRecords === "boolean") includeRecords = body.includeRecords;
  } catch {
    // No body sent, or not valid JSON - fall through with the default.
  }

  const doc = await getCarTransferRequestById(params.requestId, session.email);
  if (!doc) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (doc.initiatedBy !== "recipient") {
    return NextResponse.json({ error: "This request can't be approved from here." }, { status: 400 });
  }
  if (doc.status !== "pending") {
    return NextResponse.json({ error: `This request has already been ${doc.status}.` }, { status: 409 });
  }

  const result = await transferCar(doc.ownerEmail, doc.carId, doc.recipientEmail, includeRecords);
  if (!result.ok) {
    switch (result.reason) {
      case "car_not_found":
        return NextResponse.json({ error: "This car is no longer on your account." }, { status: 404 });
      case "already_transferred":
        return NextResponse.json({ error: "This car has already been transferred elsewhere." }, { status: 409 });
      case "same_owner":
        return NextResponse.json({ error: "That account already owns this car." }, { status: 400 });
      case "recipient_limit_reached":
        return NextResponse.json(
          { error: `The requester already has the maximum of ${result.limit} vehicles and can't accept this right now.` },
          { status: 403 }
        );
      case "recipient_already_has_car":
        return NextResponse.json(
          { error: "The requester already has a separate car on their own account with this same registration - they'll need to resolve that first (most likely by deleting it, if it was a fresh start for this same car) before this can be approved." },
          { status: 409 }
        );
    }
  }

  await decideCarTransferRequest(doc.id, doc.ownerEmail, "accepted");

  try {
    await sendCarOwnershipRequestApprovedEmail({ requesterEmail: doc.recipientEmail, carSummary: doc.carSummary });
  } catch (err) {
    console.error("Car ownership request approved-notification email failed to send:", err);
  }

  return NextResponse.json({ ok: true, newCar: result.newCar });
}
