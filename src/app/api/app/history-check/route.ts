// Place at: src/app/api/app/history-check/route.ts
//
// The full history check in the app. Never goes to Stripe - the app sells
// through the store (lib/payments/storeHistoryCheck.ts) or uses Pro's free
// report. Either way this route only turns it into a paid check on one
// plate; the app then calls the buying-guide-lookup route with the
// returned vdiPurchaseId, which runs the check and shows it, exactly as
// after a website purchase.
//
// GET  - how many store purchases this account hasn't used yet, so the
//        app offers "use my paid check" rather than selling another.
// POST { vrm, kind: "bike" | "car", use: "free" | "store" }
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { computeBuyingGuideReportTier } from "@/lib/payments/buyingGuideReportTier";
import { grantFreeProHistoryCheck } from "@/lib/payments/buyingGuideVdiCheckout";
import { claimStoreHistoryCheck, unusedStoreHistoryChecks } from "@/lib/payments/storeHistoryCheck";
import { storeBuyingOpenTo, storePurchasesEnabled } from "@/lib/payments/storePro";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  if (!storePurchasesEnabled() || !storeBuyingOpenTo(session.email)) {
    return NextResponse.json({ unusedPaidChecks: 0 }, { headers: NO_STORE });
  }
  // Null when RevenueCat can't be read - the app then just sells as usual.
  return NextResponse.json({ unusedPaidChecks: await unusedStoreHistoryChecks(session.email) }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  let body: { vrm?: unknown; kind?: unknown; use?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: NO_STORE });
  }
  const vrm = typeof body.vrm === "string" ? body.vrm.trim().toUpperCase().replace(/\s+/g, "") : "";
  const kind = body.kind === "bike" || body.kind === "car" ? body.kind : null;
  if (!vrm || vrm.length > 10 || !kind || (body.use !== "free" && body.use !== "store")) {
    return NextResponse.json({ error: "A registration, bike or car, and free or store are required." }, { status: 400, headers: NO_STORE });
  }

  if (body.use === "free") {
    const tier = await computeBuyingGuideReportTier(session.email);
    const purchaseId = tier.proFreeAvailable ? await grantFreeProHistoryCheck(session.email, vrm, kind) : null;
    if (!purchaseId) {
      return NextResponse.json({ error: "Your free check isn’t available right now." }, { status: 409, headers: NO_STORE });
    }
    return NextResponse.json({ vdiPurchaseId: purchaseId }, { headers: NO_STORE });
  }

  // A store purchase is honoured whoever made it - no storeBuyingOpenTo here.
  if (!storePurchasesEnabled()) return NextResponse.json({ error: "Not available." }, { status: 503, headers: NO_STORE });
  const claim = await claimStoreHistoryCheck(session.email, vrm, kind);
  if (claim.ok) return NextResponse.json({ vdiPurchaseId: claim.purchaseId }, { headers: NO_STORE });
  if (claim.reason === "none") {
    return NextResponse.json({ error: "No unused purchase found on this account yet." }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json(
    { error: "Couldn’t confirm the purchase just now. Please try again in a minute – you won’t be charged twice." },
    { status: 502, headers: NO_STORE }
  );
}
