// Place at: src/app/api/car-report/[token]/request-receipts/route.ts
// Car mirror of api/report/[token]/request-receipts/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { resolveCarShareToken } from "@/lib/tracker/carShareLink";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { getCarSellerReportData } from "@/lib/tracker/carSellerReportData";
import { createCarReceiptRequest } from "@/lib/tracker/carReceiptRequest";
import { sendReceiptRequestEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  if (!(await hasReportAccess(params.token))) {
    return NextResponse.json({ error: "Please verify the registration first." }, { status: 403 });
  }

  const resolved = await resolveCarShareToken(params.token);
  if (!resolved) {
    return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  }

  let body: { entryIds?: string[]; buyerMessage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!Array.isArray(body.entryIds) || body.entryIds.length === 0) {
    return NextResponse.json({ error: "Please select at least one entry." }, { status: 400 });
  }

  const data = await getCarSellerReportData(params.token);
  const selected = data.rows.filter(
    (r) => body.entryIds!.includes(r.id) && r.attachment && data.entryRequestStatus[r.id]?.status !== "pending"
  );
  if (selected.length === 0) {
    return NextResponse.json({ error: "None of the selected entries have a receipt attached, or they're already pending a decision." }, { status: 400 });
  }

  const categoryMap: Record<string, "service" | "mods" | "bills"> = { Service: "service", Modification: "mods", Bill: "bills" };
  const items = selected.map((r) => ({
    entryId: r.id,
    category: categoryMap[r.category] ?? "service",
    description: `${r.description} (${new Date(r.date).toLocaleDateString("en-GB")})`,
    attachment: r.attachment!,
  }));

  const { decisionToken } = await createCarReceiptRequest({
    ownerEmail: resolved.email,
    shareToken: params.token,
    carId: resolved.carId,
    buyerEmail: resolved.recipientEmail,
    buyerMessage: typeof body.buyerMessage === "string" ? body.buyerMessage.slice(0, 500) : undefined,
    items,
  });

  try {
    await sendReceiptRequestEmail({
      ownerEmail: resolved.email,
      bikeName: `${data.car.make} ${data.car.model}`,
      items,
      buyerMessage: body.buyerMessage,
      decisionToken,
    });
  } catch {
    // The request is still saved even if the email fails to send.
  }

  return NextResponse.json({ ok: true, requested: items.length });
}
