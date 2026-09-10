// Place at: src/app/api/cars/buying-guide-lookup/route.ts
//
// Car equivalent of api/tracker/buying-guide-lookup/route.ts - same
// MotHistoryDetails + VehicleTaxDetails free tier, same paid-purchase
// VDI check, calling generateCarBuyingGuideBriefing instead. Also adds
// the car-only independent valuation, which is free but rate-limited
// (see valuationCheckUsage.ts) - fully decoupled from the paid VDI
// purchase below, since valuation is cheap enough (~20p/call) to give
// away, just not unlimited.
//
// Also costs one Gemini call per lookup - see the briefing generation
// below. Runs sequentially after the VDG calls (needs their result
// first), so this adds real latency to the response, not just cost.
// Worth revisiting if that turns out to feel slow in practice.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseMotHistory, type RawMotTest } from "@/lib/tracker/motHistory";
import { generateCarBuyingGuideBriefing, type CarBuyingGuideBriefingResult } from "@/lib/tracker/carBuyingGuideBriefing";
import { isPro } from "@/lib/subscriptions";
import { getUserDoc } from "@/lib/tracker/userDoc";
import { canRunValuationCheck, recordValuationCheckRun, nextValuationCheckAt } from "@/lib/tracker/valuationCheckUsage";
import { getVdiPurchase, markVdiPurchaseConsumed, findRecentConsumedPurchase, VDI_PURCHASE_RETRIEVAL_WINDOW_MS } from "@/lib/tracker/vdiPurchase";
import { selfHealBuyingGuideVdiPurchase } from "@/lib/payments/buyingGuideVdiCheckout";
import { fetchVdiCheckFromVdg } from "@/lib/tracker/vdiCheckFetch";
import { fetchValuationFromVdg } from "@/lib/tracker/valuationFetch";
import { fetchVehicleTaxDetailsFromVdg, type VehicleTaxDetails } from "@/lib/tracker/vehicleTaxFetch";
import type { VdiCheckResult, ValuationResult } from "@/lib/tracker/vdiUnlock";

export const dynamic = "force-dynamic";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

interface VdgMotResponse {
  ResponseInformation: { StatusCode: number; IsSuccessStatusCode: boolean };
  Results: {
    MotHistoryDetails?: {
      Make?: string;
      Model?: string;
      FuelType?: string;
      Colour?: string;
      MotDueDate?: string | null;
      MotTestDetailsList?: RawMotTest[];
    };
  };
}

export interface CarBuyingGuideLookupResult {
  vrm: string;
  make: string;
  model: string;
  fuelType: string;
  colour: string;
  plateInRetention: boolean;
  motDueDate: string | null;
  motTests: {
    testDate: string;
    passed: boolean;
    mileage: number | null;
    mileageTrusted: boolean;
    notes: string;
  }[];
  briefing: CarBuyingGuideBriefingResult | null;
  // Populated either by a fresh purchase (a paid, consumed vdiPurchaseId
  // was supplied and passed every check in resolveVdiCheck below) or by
  // finding an earlier purchase for this exact plate still within its
  // retrieval window - see vdiPurchase.ts.
  vdiCheck: VdiCheckResult | null;
  vdiCheckBlockedReason?: "already_used" | "payment_not_confirmed" | "invalid" | "fetch_failed";
  // When vdiCheck is populated, exactly when it was paid for and how long
  // it stays retrievable for free - lets the UI say plainly "you paid for
  // this on X, available until Y" rather than leaving the purchase
  // invisible once the buyer navigates away and comes back.
  vdiCheckPurchasedAt: string | null;
  vdiCheckExpiresAt: string | null;
  // Free but rate-limited - see valuationCheckUsage.ts. Attempted on
  // every lookup regardless of vdiPurchaseId; valuationBlockedReason
  // explains why it's null when the account is over its allowance.
  valuation: ValuationResult | null;
  valuationBlockedReason?: "cooldown";
  valuationAvailableAt?: string | null;
  // Free, always attempted alongside MOT history - real tax/SORN status,
  // not rate-limited or paid like vdiCheck/valuation above.
  taxDetails: VehicleTaxDetails | null;
}

async function resolveVdiCheck(
  vdiPurchaseId: string | null,
  sessionId: string | null,
  email: string,
  vrm: string,
  apiKey: string
): Promise<{ vdiCheck: VdiCheckResult | null; blockedReason?: "already_used" | "payment_not_confirmed" | "invalid" | "fetch_failed"; purchasedAt?: string }> {
  if (!vdiPurchaseId) {
    // No purchase referenced in the URL at all - still worth checking
    // whether this exact plate already has a recent, paid check on file
    // (the buyer looked it up before, or is revisiting after closing the
    // tab from a previous purchase) before concluding there's nothing to show.
    const recent = await findRecentConsumedPurchase(email, vrm, "car");
    if (recent?.vdiCheck) return { vdiCheck: recent.vdiCheck, purchasedAt: recent.consumedAt };
    return { vdiCheck: null };
  }

  let purchase = await getVdiPurchase(vdiPurchaseId);
  if (!purchase || purchase.email !== email || purchase.vrm !== vrm || purchase.vehicleKind !== "car") {
    return { vdiCheck: null, blockedReason: "invalid" };
  }
  if (purchase.status === "consumed") {
    // A reload of the same return URL (or a bookmark of it) shouldn't
    // read as an error - the check was genuinely paid for and already run,
    // so just show it again rather than saying "already used."
    if (purchase.vdiCheck) return { vdiCheck: purchase.vdiCheck, purchasedAt: purchase.consumedAt };
    return { vdiCheck: null, blockedReason: "already_used" };
  }
  if (purchase.status === "pending") {
    if (!sessionId) return { vdiCheck: null, blockedReason: "payment_not_confirmed" };
    purchase = await selfHealBuyingGuideVdiPurchase(vdiPurchaseId, sessionId);
    if (!purchase || purchase.status !== "paid") return { vdiCheck: null, blockedReason: "payment_not_confirmed" };
  }

  const vdiCheck = await fetchVdiCheckFromVdg(vrm, apiKey);
  if (!vdiCheck) {
    // The purchase itself is genuinely paid for - a VDG hiccup here
    // shouldn't burn it. Left as "paid", not "consumed", so the buyer
    // can just look the plate up again and it'll retry rather than
    // silently losing what they paid for.
    return { vdiCheck: null, blockedReason: "fetch_failed" };
  }
  await markVdiPurchaseConsumed(vdiPurchaseId, vdiCheck);
  return { vdiCheck, purchasedAt: new Date().toISOString() };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const vrm = request.nextUrl.searchParams.get("vrm")?.trim().toUpperCase().replace(/\s+/g, "");
  if (!vrm) {
    return NextResponse.json({ error: "Registration number is required." }, { status: 400 });
  }

  const apiKey = process.env.VDG_API_KEY;
  if (!apiKey) {
    console.error("VDG_API_KEY is not configured.");
    return NextResponse.json({ error: "Lookup is not available right now." }, { status: 503 });
  }

  let motData: VdgMotResponse;
  let taxDetails: VehicleTaxDetails | null;
  try {
    const [motRes, tax] = await Promise.all([
      fetch(`${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=MotHistoryDetails&vrm=${encodeURIComponent(vrm)}`),
      fetchVehicleTaxDetailsFromVdg(vrm, apiKey),
    ]);
    motData = await motRes.json();
    taxDetails = tax;
  } catch (err) {
    console.error("Car buying guide lookup request failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach the lookup service. Enter the details manually." },
      { status: 502 }
    );
  }

  if (!motData.ResponseInformation?.IsSuccessStatusCode || !motData.Results?.MotHistoryDetails) {
    return NextResponse.json(
      { error: "No vehicle found for that registration. Enter the details manually." },
      { status: 404 }
    );
  }

  const details = motData.Results.MotHistoryDetails;
  const plateInRetention = motData.ResponseInformation.StatusCode === 21;
  const parsed = parseMotHistory(details.MotDueDate ?? null, details.MotTestDetailsList ?? []);
  const motTestsOldestFirst = parsed.tests;
  const motTests = [...parsed.tests].reverse();

  const vdiPurchaseId = request.nextUrl.searchParams.get("vdiPurchaseId");
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const { vdiCheck, blockedReason: vdiCheckBlockedReason, purchasedAt: vdiCheckPurchasedAt } = await resolveVdiCheck(
    vdiPurchaseId,
    sessionId,
    session.email,
    vrm,
    apiKey
  );
  const vdiCheckExpiresAt = vdiCheckPurchasedAt
    ? new Date(new Date(vdiCheckPurchasedAt).getTime() + VDI_PURCHASE_RETRIEVAL_WINDOW_MS).toISOString()
    : null;

  const userIsPro = await isPro(session.email);
  const user = await getUserDoc(session.email);
  let valuation: ValuationResult | null = null;
  let valuationBlockedReason: "cooldown" | undefined;
  let valuationAvailableAt: string | null = null;
  if (canRunValuationCheck(user, userIsPro)) {
    valuation = await fetchValuationFromVdg(vrm, apiKey);
    await recordValuationCheckRun(session.email);
  } else {
    valuationBlockedReason = "cooldown";
    valuationAvailableAt = nextValuationCheckAt(user, userIsPro);
  }

  let briefing: CarBuyingGuideBriefingResult | null = null;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    briefing = await generateCarBuyingGuideBriefing(
      {
        make: details.Make ?? "",
        model: details.Model ?? "",
        fuelType: details.FuelType ?? "",
        motTests: motTestsOldestFirst,
        vdiCheck: vdiCheck ?? undefined,
        valuation: valuation ?? undefined,
        taxDetails: taxDetails ?? undefined,
      },
      geminiKey
    );
  }

  const result: CarBuyingGuideLookupResult = {
    vrm,
    make: details.Make ?? "",
    model: details.Model ?? "",
    fuelType: details.FuelType ?? "",
    colour: details.Colour ?? "",
    plateInRetention,
    motDueDate: parsed.motDueDate,
    motTests,
    briefing,
    vdiCheck,
    vdiCheckBlockedReason,
    vdiCheckPurchasedAt: vdiCheckPurchasedAt ?? null,
    vdiCheckExpiresAt,
    valuation,
    valuationBlockedReason,
    valuationAvailableAt,
    taxDetails,
  };

  return NextResponse.json(result);
}
