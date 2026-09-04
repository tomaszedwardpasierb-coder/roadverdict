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
import { getUserDoc } from "@/lib/tracker/userDoc";

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

export const PRO_MONTHLY_PRICE = "£4.99";
export const PRO_ANNUAL_PRICE = "£49";
export const PRO_ANNUAL_MONTHLY_EQUIV = "£4.08";

export const PRO_FEATURES = [
  "Additional bikes beyond your first",
  "Multi-bike overview and cost comparison",
  "Full Reports - fuel economy, running costs, and spend trends over time",
  "Category-by-category spend breakdown (which category, and how much)",
  "Exact reminder due dates, plus automatic reminder emails",
  "Quote Checker, Cost Calculator & Buying Guide, pre-filled with your bike's own details",
  "AI-generated \"Story So Far\" summary",
  "Detailed buyer/seller verdict report",
  "Export your full history as CSV",
  "Batch receipt scanning (multiple files at once)",
] as const;
