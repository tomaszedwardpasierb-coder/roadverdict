// Place at: src/lib/tracker/buyingGuideLookupUsage.ts
//
// Per-account cooldown on the Buying Guide's free lookup itself (MOT
// history + tax details - see buyingGuideLookupCache.ts for the
// separate, plate-level cache that sits alongside this). Unlike
// vehicleHistoryReportUsage.ts's cooldown (Pro-only, gates the paid VDI
// report), this applies to every account alike - there is no unlimited
// tier for the base free lookup. Same field+predicate+recorder shape as
// vehicleHistoryReportUsage.ts/valuationCheckUsage.ts.
import { getContainer } from "@/lib/cosmos";
import type { UserDoc } from "@/lib/tracker/userDoc";
import { BUYING_GUIDE_LOOKUP_COOLDOWN_MS } from "@/lib/payments/pricing";

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

export async function recordBuyingGuideLookupRun(email: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(email, email).read<UserDoc>();
  if (!resource) return;
  resource.buyingGuideLookupUsage = { lastRunAt: new Date().toISOString() };
  await container.items.upsert(resource);
}
