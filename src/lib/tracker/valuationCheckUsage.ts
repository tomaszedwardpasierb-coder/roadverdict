// Place at: src/lib/tracker/valuationCheckUsage.ts
//
// Per-account rate limit on the Buying Guide's free, car-only
// independent valuation (ValuationDetails costs a confirmed £0.20/call -
// cheap enough to give away free, unlike VDICheck at a confirmed £3, but
// not so cheap it should be unlimited). Deliberately its own module and
// its own UserDoc field, separate from vdiCheckUsage.ts/vdiCheckUsage -
// VDI moved to a pure pay-per-use purchase with no cooldown concept at
// all (see vdiPurchase.ts), so the two rate limits must not share state.
// Same field+predicate+recorder shape as vdiCheckUsage.ts/
// receiptRequest.ts's canSendReminder/recordReminderSent.
//
// Pro's cooldown used to be 24h (vs Free's 7 days) - at £0.20/call that
// alone worked out to roughly £6/month, more than Pro's entire £5.99
// subscription price on this one feature alone. Matched to Free's 7-day
// cooldown for a while after that (~£0.86/month) - there was no product
// reason Pro needed this specific check 7x more often than Free.
//
// Tightened again to 28 days, matching the free monthly vehicle-history
// report's own cadence (PRO_FREE_REPORT_COOLDOWN_MS in pricing.ts) - at
// the same confirmed £0.20/call, the 7-day version still cost up to
// ~£0.86/month per Pro subscriber with no product reason for it to run
// more often than the report it sits alongside. Monthly brings that down
// to ~£0.20/month, closing the gap between the two cooldowns rather than
// leaving this one as the odd one out.
import type { UserDoc } from "@/lib/tracker/userDoc";
import { replaceIfUnchanged } from "@/lib/tracker/atomicUpdate";

export const VALUATION_CHECK_COOLDOWN_MS_FREE = 7 * 24 * 60 * 60 * 1000;
export const VALUATION_CHECK_COOLDOWN_MS_PRO = 28 * 24 * 60 * 60 * 1000;

function cooldownMs(isPro: boolean): number {
  return isPro ? VALUATION_CHECK_COOLDOWN_MS_PRO : VALUATION_CHECK_COOLDOWN_MS_FREE;
}

export function canRunValuationCheck(user: UserDoc | null, isPro: boolean): boolean {
  if (!user?.valuationCheckUsage) return true;
  return Date.now() - new Date(user.valuationCheckUsage.lastRunAt).getTime() > cooldownMs(isPro);
}

// Null once the cooldown has already elapsed (or never started) - a
// free run is available right now, so there is no "next" date to show.
export function nextValuationCheckAt(user: UserDoc | null, isPro: boolean): string | null {
  if (!user?.valuationCheckUsage) return null;
  const nextMs = new Date(user.valuationCheckUsage.lastRunAt).getTime() + cooldownMs(isPro);
  return nextMs > Date.now() ? new Date(nextMs).toISOString() : null;
}

// Takes the exact UserDoc + etag the caller already read to run
// canRunValuationCheck in the first place (see getDocWithEtag in
// atomicUpdate.ts), and writes the new lastRunAt conditioned on nothing
// else having changed that document since - closes the race where two
// concurrent requests could both pass the cooldown check before either
// one's write landed.
export async function recordValuationCheckRun(
  email: string,
  etag: string,
  baseUser: UserDoc,
  isPro: boolean
): Promise<{ recorded: boolean; alreadyUsed?: boolean }> {
  const result = await replaceIfUnchanged<UserDoc>(
    email,
    email,
    etag,
    baseUser,
    (doc) => ({ ...doc, valuationCheckUsage: { lastRunAt: new Date().toISOString() } }),
    (doc) => canRunValuationCheck(doc, isPro)
  );
  if (result.ok) return { recorded: true };
  if (result.reason === "not_found") return { recorded: false };
  return { recorded: false, alreadyUsed: true };
}
