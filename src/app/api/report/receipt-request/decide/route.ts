// Place at: src/app/api/report/receipt-request/decide/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getReceiptRequestByDecisionToken, decideReceiptRequestItems } from "@/lib/tracker/receiptRequest";
import { getCarReceiptRequestByDecisionToken, decideCarReceiptRequestItems } from "@/lib/tracker/carReceiptRequest";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { token?: string; entryIds?: string[] | "all"; decision?: "approved" | "declined" | "pending"; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.token || !body.decision || !["approved", "declined", "pending"].includes(body.decision)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const request = await getReceiptRequestByDecisionToken(body.token);
  if (request) {
    const updated = await decideReceiptRequestItems(request.id, request.pk, body.entryIds ?? "all", body.decision, body.reason);
    return NextResponse.json({ ok: true, items: updated?.items ?? [] });
  }

  const carRequest = await getCarReceiptRequestByDecisionToken(body.token);
  if (carRequest) {
    const updated = await decideCarReceiptRequestItems(carRequest.id, carRequest.pk, body.entryIds ?? "all", body.decision, body.reason);
    return NextResponse.json({ ok: true, items: updated?.items ?? [] });
  }

  return NextResponse.json({ error: "This request link is no longer valid." }, { status: 404 });
}
