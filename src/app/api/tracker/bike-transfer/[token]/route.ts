// Place at: src/app/api/tracker/bike-transfer/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBikeTransferRequestByToken } from "@/lib/tracker/bikeTransferRequest";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const doc = await getBikeTransferRequestByToken(params.token);
  if (!doc) {
    return NextResponse.json({ error: "This offer doesn't exist or has expired." }, { status: 404 });
  }

  return NextResponse.json({
    ownerEmail: doc.ownerEmail,
    recipientEmail: doc.recipientEmail,
    bikeSummary: doc.bikeSummary,
    status: doc.status,
    createdAt: doc.createdAt,
  });
}
