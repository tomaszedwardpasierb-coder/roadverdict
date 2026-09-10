// Place at: src/app/api/cars/car-transfer/[token]/decline/route.ts
// Car mirror of api/tracker/bike-transfer/[token]/decline/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getCarTransferRequestByToken, decideCarTransferRequest } from "@/lib/tracker/carTransferRequest";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const doc = await getCarTransferRequestByToken(params.token);
  if (!doc) {
    return NextResponse.json({ error: "This offer doesn't exist or has expired." }, { status: 404 });
  }
  if (doc.status !== "pending") {
    return NextResponse.json({ error: `This offer has already been ${doc.status}.` }, { status: 409 });
  }

  await decideCarTransferRequest(doc.id, doc.ownerEmail, "declined");
  return NextResponse.json({ ok: true });
}
