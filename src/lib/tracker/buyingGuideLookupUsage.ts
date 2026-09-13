// Place at: src/lib/tracker/buyingGuideLookupUsage.ts
//
// Per-account cooldown on the Buying Guide's free lookup itself (MOT
// history + tax details - see buyingGuideLookupCache.ts for the
// separate, plate-level cache that sits alongside this). Unlike
// vehicleHistoryReportUsage.ts's cooldown (Pro-only, gates the paid VDI
// report), this applies to every account alike - there is no unlimited
// tier for the base free lookup. Same field+predicate+recorder shape as
// vehicleHistoryReportUsage.ts/valuationCheckUsage.ts.
import type { UserDoc } from "@/lib/tracker/userDoc";
import { BUYING_GUIDE_LOOKUP_COOLDOWN_MS } from "@/lib/payments/pricing";
import { replaceIfUnchanged } from "@/lib/tracker/atomicUpdate";

export function canRunFreeBuyingGuideLookup(user: UserDoc | null): boolean {
  if (!user?.buyingGuideLookupUsage) return true;
  return Date.now() - new Date(user.buyingGuideLookupUsage.lastRunAt).getTime() > BUYING_GUIDE_LOOKUP_COOLDOWN_MS;
}

// Null once the cooldown has already elapsed (or never started) - a free
// lookup is available right now, so there is no "next" date to show.
export function nextFreeBuyingGuideLookupAt(user: UserDoc | null): string | null {
  if (!user?.buyingGuideLookupUsage) return null;
  const nextMs = new Date(user.buyingGuideLookupUsage.lastRunAt).getTime() + BUYING_GUIDE_LOOKUP_COOLDOWN_MS;
  return nextMs > Date.now() ? new Date(nextMs).toISOString() : null;
}

// Takes the exact UserDoc + etag the caller already read to run
// canRunFreeBuyingGuideLookup in the first place, and writes the new
// lastRunAt conditioned on nothing else having changed that document
// since - closes the race where two concurrent lookups could both pass
// the cooldown check before either write landed.
export async function recordBuyingGuideLookupRun(
  email: string,
  etag: string,
  baseUser: UserDoc
): Promise<{ recorded: boolean; alreadyUsed?: boolean }> {
  const result = await replaceIfUnchanged<UserDoc>(
    email,
    email,
    etag,
    baseUser,
    (doc) => ({ ...doc, buyingGuideLookupUsage: { lastRunAt: new Date().toISOString() } }),
    canRunFreeBuyingGuideLookup
  );
  if (result.ok) return { recorded: true };
  if (result.reason === "not_found") return { recorded: false };
  return { recorded: false, alreadyUsed: true };
}
