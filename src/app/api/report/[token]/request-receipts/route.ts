// Place at: src/app/api/report/[token]/request-receipts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { getSellerReportData } from "@/lib/tracker/sellerReportData";
import { createReceiptRequest } from "@/lib/tracker/receiptRequest";
import { sendReceiptRequestEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  // Never trust a request to name entries it hasn't already earned the
  // right to see the existence of - re-verify the plate gate server-side
  // rather than assume the client only calls this after passing it.
  if (!(await hasReportAccess(params.token))) {
    return NextResponse.json({ error: "Please verify the registration first." }, { status: 403 });
  }

  const resolved = await resolveShareToken(params.token);
  if (!resolved) {
    return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  }

  let body: { entryIds?: string[]; buyerEmail?: string; buyerMessage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!Array.isArray(body.entryIds) || body.entryIds.length === 0) {
    return NextResponse.json({ error: "Please select at least one entry." }, { status: 400 });
  }

  // Re-derive what each selected id actually is from the real data,
  // rather than trusting whatever category/description the client
  // sends - the request and the eventual email should describe exactly
  // what's really being asked for.
  const data = await getSellerReportData(params.token);
  // Defense in depth against duplicate active requests, matching the
  // client's own isSelectable() check - an entry already pending
  // elsewhere is silently skipped rather than creating an overlapping
  // second request for the same thing (which is exactly what produced
  // the radio-button collision bug: two separate request documents
  // both using the same entryId).
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

  const { decisionToken } = await createReceiptRequest({
    ownerEmail: resolved.email,
    shareToken: params.token,
    bikeId: resolved.bikeId,
    buyerEmail: typeof body.buyerEmail === "string" && body.buyerEmail.includes("@") ? body.buyerEmail.trim().toLowerCase() : undefined,
    buyerMessage: typeof body.buyerMessage === "string" ? body.buyerMessage.slice(0, 500) : undefined,
    items,
  });

  try {
    await sendReceiptRequestEmail({
      ownerEmail: resolved.email,
      bikeName: `${data.bike.make} ${data.bike.model}`,
      items,
      buyerMessage: body.buyerMessage,
      decisionToken,
    });
  } catch {
    // The request is still saved even if the email fails to send - the
    // owner can still find it another way later rather than the whole
    // request silently vanishing over a transient email error.
  }

  return NextResponse.json({ ok: true, requested: items.length });
}
