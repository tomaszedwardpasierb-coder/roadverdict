// Place at: src/app/api/cars/car-transfer/[token]/route.ts
// Car mirror of api/tracker/bike-transfer/[token]/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getCarTransferRequestByToken } from "@/lib/tracker/carTransferRequest";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const doc = await getCarTransferRequestByToken(params.token);
  if (!doc) {
    return NextResponse.json({ error: "This offer doesn't exist or has expired." }, { status: 404 });
  }

  return NextResponse.json({
    ownerEmail: doc.ownerEmail,
    recipientEmail: doc.recipientEmail,
    carSummary: doc.carSummary,
    status: doc.status,
    createdAt: doc.createdAt,
  });
}
