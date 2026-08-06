// Place at: src/app/api/report/[token]/remind/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { getSellerReportData } from "@/lib/tracker/sellerReportData";
import { getReceiptRequestsForShareToken, canSendReminder, recordReminderSent, regenerateDecisionToken } from "@/lib/tracker/receiptRequest";
import { sendReceiptRequestEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!(await hasReportAccess(params.token))) {
    return NextResponse.json({ error: "Please verify the registration first." }, { status: 403 });
  }

  let body: { entryId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.entryId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const resolved = await resolveShareToken(params.token);
  if (!resolved) {
    return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  }

  // Reminds about the whole request that item belongs to, not just the
  // one entry in isolation - a buyer nudging about one receipt out of a
  // bundle of five doesn't make sense on its own, and the owner sees
  // all five together either way.
  const requests = await getReceiptRequestsForShareToken(resolved.email, params.token);
  const request = requests.find((r) => r.items.some((i) => i.entryId === body.entryId && i.status === "pending"));
  if (!request) {
    return NextResponse.json({ error: "This request is no longer pending." }, { status: 404 });
  }

  if (!canSendReminder(request)) {
    return NextResponse.json({ error: "A reminder was already sent recently. Please check back later." }, { status: 429 });
  }

  // A fresh token, not the original - only the original's hash was ever
  // stored, by design, so there's no raw value left to reuse. Rotating
  // it is safe: if the owner hasn't acted yet, the old link (still
  // sitting unused in their first email) was never going to be used
  // anyway.
  const decisionToken = await regenerateDecisionToken(request.id, resolved.email);
  if (!decisionToken) {
    return NextResponse.json({ error: "Could not send a reminder right now." }, { status: 500 });
  }

  const data = await getSellerReportData(params.token);
  const pendingItems = request.items.filter((i) => i.status === "pending");

  try {
    await sendReceiptRequestEmail({
      ownerEmail: resolved.email,
      bikeName: `${data.bike.make} ${data.bike.model}`,
      items: pendingItems,
      buyerMessage: request.buyerMessage,
      decisionToken,
      isReminder: true,
    });
  } catch {
    // Rate limit is still recorded even if the send fails - otherwise a
    // transient email error would let the buyer retry immediately and
    // the cooldown would never actually apply.
  }

  await recordReminderSent(request.id, resolved.email);
  return NextResponse.json({ ok: true });
}
