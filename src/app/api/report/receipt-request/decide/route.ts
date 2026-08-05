// Place at: src/app/api/report/receipt-request/decide/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getReceiptRequestByDecisionToken, decideReceiptRequestItems } from "@/lib/tracker/receiptRequest";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { token?: string; entryIds?: string[] | "all"; decision?: "approved" | "declined" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.token || !body.decision || (body.decision !== "approved" && body.decision !== "declined")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const request = await getReceiptRequestByDecisionToken(body.token);
  if (!request) {
    return NextResponse.json({ error: "This request link is no longer valid." }, { status: 404 });
  }

  const updated = await decideReceiptRequestItems(request.id, request.pk, body.entryIds ?? "all", body.decision);
  return NextResponse.json({ ok: true, items: updated?.items ?? [] });
}
