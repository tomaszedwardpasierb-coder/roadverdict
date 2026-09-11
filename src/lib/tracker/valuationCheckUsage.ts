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
// cooldown instead (~£0.86/month) - there's no product reason Pro needs
// this specific check 7x more often than Free.
import { getContainer } from "@/lib/cosmos";
import type { UserDoc } from "@/lib/tracker/userDoc";

export const VALUATION_CHECK_COOLDOWN_MS_FREE = 7 * 24 * 60 * 60 * 1000;
export const VALUATION_CHECK_COOLDOWN_MS_PRO = 7 * 24 * 60 * 60 * 1000;

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

export async function recordValuationCheckRun(email: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(email, email).read<UserDoc>();
  if (!resource) return;
  resource.valuationCheckUsage = { lastRunAt: new Date().toISOString() };
  await container.items.upsert(resource);
}
