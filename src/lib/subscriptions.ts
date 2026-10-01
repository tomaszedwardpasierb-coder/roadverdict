// Place at: src/lib/subscriptions.ts
//
// Single source of truth for plan checks throughout the app.
//
// Real per-account Premium, granted manually by the admin (see
// src/lib/tracker/userAccount.ts's grantPremium(), used from /tomasz)
// until a real payment platform exists - not a blanket unlock. Checks
// the same `plan` field that admin tool writes, on the `type: "user"`
// Cosmos doc (src/lib/tracker/userDoc.ts).
//
// Future shape once Stripe (or another platform) is wired up:
//   export async function isPro(email: string): Promise<boolean> {
//     const sub = await getSubscriptionForUser(email); // your Stripe check
//     return sub?.status === 'active' || (existing admin-grant check);
//   }
import { getUserDoc, type UserDoc } from "@/lib/tracker/userDoc";
import { MAX_FREE_VEHICLES, vehicleLimitFor } from "@/lib/tracker/vehicleLimit";
// Re-exported for any existing server-side importer - see proPlan.ts's
// own comment for why the real definitions live there now, not here.
export { PRO_MONTHLY_PRICE, PRO_ANNUAL_PRICE, PRO_ANNUAL_MONTHLY_EQUIV, PRO_FEATURES } from "@/lib/proPlan";

export interface ProStatus {
  isPro: boolean;
  expiresAt: string | null;
  // Rounded up, not down - a plan expiring in a few hours still reads
  // as "1 day left", not "0 days left" (which would read as already
  // expired). Null whenever isPro is false, rather than a negative or
  // zero number.
  daysRemaining: number | null;
}

// The one real place "is this plan still active" gets decided - isPro()
// below is just this with the extra detail dropped, so there is only
// ever one implementation of that check to keep correct.
export async function getProStatus(email: string): Promise<ProStatus> {
  try {
    const user = await getUserDoc(email);
    if (!user?.plan) return { isPro: false, expiresAt: null, daysRemaining: null };

    const expiresAtMs = new Date(user.plan.expiresAt).getTime();
    const active = expiresAtMs > Date.now();
    if (!active) return { isPro: false, expiresAt: null, daysRemaining: null };

    const daysRemaining = Math.ceil((expiresAtMs - Date.now()) / 86_400_000);
    return { isPro: true, expiresAt: user.plan.expiresAt, daysRemaining };
  } catch {
    // Fail closed - same direction getSession() already fails in for
    // any other auth-adjacent check gone wrong (a network blip, a
    // permissions issue). Never grant Pro access on an error.
    return { isPro: false, expiresAt: null, daysRemaining: null };
  }
}

export async function isPro(email: string): Promise<boolean> {
  return (await getProStatus(email)).isPro;
}


// Extra vehicles this account currently pays for - 0 once the extra
// vehicles subscription's paid period has run out.
export function paidExtraVehicles(user: UserDoc | null | undefined): number {
  const extra = user?.extraVehicles;
  if (!extra || new Date(extra.paidUntil).getTime() <= Date.now()) return 0;
  return extra.quantity;
}

// How many vehicles (bikes and cars together) this account may track:
// its plan's cap, lifted by any admin-set allowance - see
// vehicleLimitFor(). One read of the user doc for both. Fails closed to
// the free cap, the same direction getProStatus() fails in.
export async function getVehicleLimit(email: string): Promise<number> {
  try {
    const user = await getUserDoc(email);
    const pro = !!user?.plan && new Date(user.plan.expiresAt).getTime() > Date.now();
    return vehicleLimitFor(pro, user?.vehicleAllowance, paidExtraVehicles(user));
  } catch {
    return MAX_FREE_VEHICLES;
  }
}
