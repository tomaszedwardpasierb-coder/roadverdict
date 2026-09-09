// Place at: src/app/api/car-report/[token]/remind/route.ts
// Car mirror of api/report/[token]/remind/route.ts. hasReportAccess is
// reused directly - it's keyed purely on the share token, with no
// bike/car-specific logic inside it.
import { NextRequest, NextResponse } from "next/server";
import { resolveCarShareToken } from "@/lib/tracker/carShareLink";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { getCarSellerReportData } from "@/lib/tracker/carSellerReportData";
import { getCarReceiptRequestsForShareToken, canSendCarReminder, recordCarReminderSent, regenerateCarDecisionToken } from "@/lib/tracker/carReceiptRequest";
import { sendReceiptRequestEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
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

  const resolved = await resolveCarShareToken(params.token);
  if (!resolved) {
    return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  }

  const requests = await getCarReceiptRequestsForShareToken(resolved.email, params.token);
  const request = requests.find((r) => r.items.some((i) => i.entryId === body.entryId && i.status === "pending"));
  if (!request) {
    return NextResponse.json({ error: "This request is no longer pending." }, { status: 404 });
  }

  if (!canSendCarReminder(request)) {
    return NextResponse.json({ error: "A reminder was already sent recently. Please check back later." }, { status: 429 });
  }

  const decisionToken = await regenerateCarDecisionToken(request.id, resolved.email);
  if (!decisionToken) {
    return NextResponse.json({ error: "Could not send a reminder right now." }, { status: 500 });
  }

  const data = await getCarSellerReportData(params.token);
  const pendingItems = request.items.filter((i) => i.status === "pending");

  try {
    await sendReceiptRequestEmail({
      ownerEmail: resolved.email,
      bikeName: `${data.car.make} ${data.car.model}`,
      items: pendingItems,
      buyerMessage: request.buyerMessage,
      decisionToken,
      isReminder: true,
    });
  } catch {
    // Rate limit is still recorded even if the send fails.
  }

  await recordCarReminderSent(request.id, resolved.email);
  return NextResponse.json({ ok: true });
}
