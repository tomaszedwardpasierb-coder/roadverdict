// Place at: src/app/api/tracker/bike-transfer/[token]/decline/route.ts
//
// Deliberately no sign-in requirement here, unlike accept - declining
// doesn't move any data or need proof of identity beyond the token
// itself. Requiring an account just to say no to an unwanted offer
// would be a real, pointless friction.
import { NextRequest, NextResponse } from "next/server";
import { getBikeTransferRequestByToken, decideBikeTransferRequest } from "@/lib/tracker/bikeTransferRequest";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const doc = await getBikeTransferRequestByToken(params.token);
  if (!doc) {
    return NextResponse.json({ error: "This offer doesn't exist or has expired." }, { status: 404 });
  }
  if (doc.status !== "pending") {
    return NextResponse.json({ error: `This offer has already been ${doc.status}.` }, { status: 409 });
  }

  await decideBikeTransferRequest(doc.id, doc.ownerEmail, "declined");
  return NextResponse.json({ ok: true });
}
