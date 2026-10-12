// Place at: src/lib/payments/storePro.ts
//
// Pro bought inside the app - Google Play or the App Store - through
// RevenueCat. Kept on its own field (UserDoc.storePro), never in `plan`:
// `plan` belongs to Stripe and the admin's grants, and two payment systems
// writing one expiry date would overwrite each other. Whether an account is
// Pro is then simply "either one is still running" (proExpiry below).
//
// RevenueCat is the source of truth for a store purchase. Our webhook and
// the app's "I just bought it" call both do the same thing: read the
// customer's current "pro" entitlement from RevenueCat and copy it here
// (syncStorePro). One path for purchases, renewals, cancellations,
// refunds and transfers alike - nothing is inferred from event types.
//
// Off until every REVENUECAT_* setting below exists: the app shows no
// Upgrade button, and the routes refuse.
import { createHmac } from "crypto";
import { getContainer } from "@/lib/cosmos";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { UserDoc } from "@/lib/tracker/userDoc";

// Only the expiry dates are read, so callers with a partial user record work too.
type ProDates = { plan?: { expiresAt: string } | null; storePro?: { expiresAt: string } | null } | null | undefined;

export const PRO_ENTITLEMENT = "pro";

export interface StorePro {
  store: "play_store" | "app_store" | "other";
  productId: string;
  expiresAt: string;
  // False once the subscriber has cancelled - Pro still runs to expiresAt.
  willRenew: boolean;
  updatedAt: string;
}

export function storePurchasesEnabled(): boolean {
  return !!(
    process.env.REVENUECAT_SECRET_KEY &&
    process.env.REVENUECAT_WEBHOOK_AUTH &&
    process.env.REVENUECAT_APP_USER_SECRET &&
    (process.env.REVENUECAT_ANDROID_API_KEY || process.env.REVENUECAT_IOS_API_KEY)
  );
}

// The public SDK key the app configures RevenueCat with, per platform.
// These are meant to ship inside apps; they only allow buying, not reading.
export function revenueCatPublicKey(platform: "android" | "ios"): string | null {
  const key = platform === "ios" ? process.env.REVENUECAT_IOS_API_KEY : process.env.REVENUECAT_ANDROID_API_KEY;
  return key?.trim() || null;
}

// The id RevenueCat knows this account by. Derived from the email with a
// secret, so RevenueCat (and anything it shares with the stores) never
// sees the address, and the same account always gets the same id.
export function revenueCatAppUserId(email: string): string {
  const secret = process.env.REVENUECAT_APP_USER_SECRET;
  if (!secret) throw new Error("REVENUECAT_APP_USER_SECRET is not set");
  return `rv_${createHmac("sha256", secret).update(email.toLowerCase().trim()).digest("hex").slice(0, 32)}`;
}

function laterOf(a: string | null | undefined, b: string | null | undefined): string | null {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  if (Number.isNaN(ta) && Number.isNaN(tb)) return null;
  if (Number.isNaN(tb) || ta >= tb) return a ?? null;
  return b ?? null;
}

// When this account's Pro runs out, from whichever source runs longest -
// Stripe or an admin grant (`plan`), or the app stores (`storePro`).
// Null when there's neither. Callers still compare it with now.
export function proExpiry(user: ProDates): string | null {
  return laterOf(user?.plan?.expiresAt, user?.storePro?.expiresAt);
}

export function isProActive(user: ProDates, now = Date.now()): boolean {
  const exp = proExpiry(user);
  return !!exp && new Date(exp).getTime() > now;
}

// Where an account's running Pro comes from, for the app's Upgrade screen:
// "store" means manage it in Google Play or the App Store, "web" means on
// the website.
export function proSource(user: ProDates, now = Date.now()): "store" | "web" | null {
  const store = user?.storePro && new Date(user.storePro.expiresAt).getTime() > now;
  const web = user?.plan && new Date(user.plan.expiresAt).getTime() > now;
  if (web) return "web";
  if (store) return "store";
  return null;
}

// RevenueCat's subscriber record, only the parts we read.
interface RcSubscriber {
  subscriber?: {
    entitlements?: Record<string, { expires_date: string | null; product_identifier: string }>;
    subscriptions?: Record<string, { store?: string; unsubscribe_detected_at?: string | null; expires_date?: string | null }>;
  };
}

// The "pro" entitlement as RevenueCat sees it right now, or null when
// there is none or it has run out. A lifetime purchase (no expiry) isn't
// something we sell, so it's treated as a year from now to stay bounded.
export function storeProFromSubscriber(data: RcSubscriber, now = Date.now()): StorePro | null {
  const ent = data.subscriber?.entitlements?.[PRO_ENTITLEMENT];
  if (!ent) return null;
  const expiresAt = ent.expires_date ?? new Date(now + 365 * 86_400_000).toISOString();
  if (new Date(expiresAt).getTime() <= now) return null;
  const sub = data.subscriber?.subscriptions?.[ent.product_identifier];
  const store = sub?.store === "play_store" || sub?.store === "app_store" ? sub.store : "other";
  return {
    store,
    productId: ent.product_identifier,
    expiresAt,
    willRenew: !sub?.unsubscribe_detected_at,
    updatedAt: new Date(now).toISOString(),
  };
}

async function fetchSubscriber(appUserId: string): Promise<RcSubscriber | null> {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) return null;
  try {
    const res = await fetchWithTimeout(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as RcSubscriber;
  } catch {
    return null;
  }
}

async function findUserByAppUserId(appUserId: string): Promise<UserDoc | null> {
  const { resources } = await getContainer()
    .items.query<UserDoc>({
      query: "SELECT * FROM c WHERE c.type = 'user' AND c.revenuecatAppUserId = @id",
      parameters: [{ name: "@id", value: appUserId }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

// Remembers which RevenueCat id belongs to this account, so a webhook
// naming only the id can find it. Written when the app first asks for its
// purchase settings, before any purchase can happen.
export async function rememberAppUserId(user: UserDoc, appUserId: string): Promise<void> {
  if (user.revenuecatAppUserId === appUserId) return;
  await getContainer().item(user.id, user.pk).patch([{ op: "set", path: "/revenuecatAppUserId", value: appUserId }]);
}

export type SyncResult = { ok: true; storePro: StorePro | null } | { ok: false; reason: "unknown_user" | "revenuecat_unavailable" };

// Copies RevenueCat's current "pro" entitlement onto the account it
// belongs to: sets storePro while it runs, removes it once it doesn't.
export async function syncStorePro(appUserId: string, now = Date.now()): Promise<SyncResult> {
  const user = await findUserByAppUserId(appUserId);
  if (!user) return { ok: false, reason: "unknown_user" };
  const data = await fetchSubscriber(appUserId);
  if (!data) return { ok: false, reason: "revenuecat_unavailable" };
  const storePro = storeProFromSubscriber(data, now);
  const item = getContainer().item(user.id, user.pk);
  if (storePro) await item.patch([{ op: "set", path: "/storePro", value: storePro }]);
  else if (user.storePro) await item.patch([{ op: "remove", path: "/storePro" }]);
  return { ok: true, storePro };
}
