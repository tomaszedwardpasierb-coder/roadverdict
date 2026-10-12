// Place at: src/app/api/app/purchases/route.ts
//
// In-app Pro for the app (Google Play now, the App Store later), via
// RevenueCat - see lib/payments/storePro.ts.
//
// GET  ?platform=android|ios - whether buying in the app is switched on,
//      the public RevenueCat key for that platform, the id RevenueCat
//      knows this account by, and whether the account is already Pro (and
//      from where, so a website subscriber isn't offered a second one).
// POST - "I just bought or restored": reads the entitlement from
//      RevenueCat straight away, so Pro switches on without waiting for
//      the webhook.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserDoc } from "@/lib/tracker/userDoc";
import { PRO_FEATURES } from "@/lib/proPlan";
import {
  isProActive,
  proSource,
  rememberAppUserId,
  revenueCatAppUserId,
  revenueCatPublicKey,
  storePurchasesEnabled,
  syncStorePro,
} from "@/lib/payments/storePro";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  const platform = req.nextUrl.searchParams.get("platform") === "ios" ? "ios" : "android";

  const user = await getUserDoc(session.email);
  // The same feature list the website's Pro page uses, so they never differ.
  const status = { isPro: isProActive(user), proSource: proSource(user), features: PRO_FEATURES };
  const apiKey = revenueCatPublicKey(platform);
  if (!storePurchasesEnabled() || !apiKey || !user) {
    return NextResponse.json({ enabled: false, ...status }, { headers: NO_STORE });
  }

  const appUserId = revenueCatAppUserId(session.email);
  await rememberAppUserId(user, appUserId);
  return NextResponse.json({ enabled: true, apiKey, appUserId, ...status }, { headers: NO_STORE });
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  if (!storePurchasesEnabled()) return NextResponse.json({ error: "Not available." }, { status: 503, headers: NO_STORE });

  const result = await syncStorePro(revenueCatAppUserId(session.email));
  if (!result.ok) {
    return NextResponse.json(
      { error: "Couldn't confirm the purchase just now. It will appear within a few minutes." },
      { status: result.reason === "unknown_user" ? 404 : 502, headers: NO_STORE }
    );
  }
  const user = await getUserDoc(session.email);
  return NextResponse.json({ isPro: isProActive(user), proSource: proSource(user) }, { headers: NO_STORE });
}
