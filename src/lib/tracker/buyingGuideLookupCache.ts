// Place at: src/lib/tracker/buyingGuideLookupCache.ts
//
// Global, plate-level cache for the Buying Guide free lookup's two
// billed VDG calls (MotHistoryDetails, VehicleTaxDetails) - see
// buyingGuideLookupUsage.ts for the separate, per-account monthly quota
// this sits alongside. Deliberately NOT keyed by account: these are
// objective facts about the vehicle (make/model/MOT history/tax status),
// true for whoever looks the plate up, so a second person checking the
// same car anyone else already checked shouldn't cost RoadVerdict a
// second VDG call - it costs the same, real money, no matter who's
// asking.
//
// Shares its TTL with VDI_PURCHASE_RETRIEVAL_WINDOW_MS (vdiPurchase.ts) -
// deliberately not its own, independently-tuned constant, since "how
// long a check stays retrievable" is meant to be one number across every
// kind of check the Buying Guide does, free or paid.
//
// The AI-written briefing IS cached here (see CachedBuyingGuideBriefing
// below), but only ever the FREE-tier version, generated with no VDI
// check or valuation facts folded in - that one's true regardless of
// who's asking or what they've paid for, same as the VDG facts above, so
// it's safe to share the exact same way. A briefing generated WITH VDI/
// valuation facts folded in (a paying visitor's own richer version) is
// never written here - caching that globally would leak one buyer's
// paid findings into a later, unrelated free visitor's briefing for
// free. The route regenerates a fresh, VDI-aware briefing for a paying
// visitor every time instead of reading this cache's version.
import { getContainer } from "@/lib/cosmos";
import type { VehicleKind } from "@/lib/tracker/vdiUnlock";
import type { ParsedMotTest } from "@/lib/tracker/motHistory";
import type { VehicleTaxDetails } from "@/lib/tracker/vehicleTaxFetch";
import { VDI_PURCHASE_RETRIEVAL_WINDOW_MS } from "@/lib/tracker/vdiPurchase";

export interface CachedBuyingGuideBriefing {
  motFlags: string[];
  modelNotes: string[];
  summary: string;
}

export interface CachedBuyingGuideLookupData {
  make: string;
  model: string;
  fuelType: string;
  colour: string;
  plateInRetention: boolean;
  motDueDate: string | null;
  // Oldest-first, same shape parseMotHistory itself returns - the
  // reversed, newest-first display order used by the route's own
  // response is derived from this at read time, not stored twice.
  motTestsOldestFirst: ParsedMotTest[];
  taxDetails: VehicleTaxDetails | null;
  // Only ever the FREE-tier version - generated with no VDI check or
  // valuation facts folded in, so it's safe to hand to anyone regardless
  // of what they have or haven't paid for. null means no safe version
  // has been generated yet (e.g. the only visitor so far had paid
  // access and got a richer, VDI-aware briefing instead) - the route
  // backfills this the next time a free-tier visitor generates one, so
  // it doesn't stay null forever on a plate that's actually popular.
  briefing: CachedBuyingGuideBriefing | null;
}

interface BuyingGuideLookupCacheDoc {
  id: string;
  pk: "system";
  type: "buyingGuideLookupCache";
  vehicleKind: VehicleKind;
  vrm: string;
  cachedAt: string;
  data: CachedBuyingGuideLookupData;
}

function cacheDocId(vehicleKind: VehicleKind, vrm: string): string {
  return `buyingGuideLookupCache::${vehicleKind}::${vrm}`;
}

export async function getCachedBuyingGuideLookup(vehicleKind: VehicleKind, vrm: string): Promise<CachedBuyingGuideLookupData | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(cacheDocId(vehicleKind, vrm), "system").read<BuyingGuideLookupCacheDoc>();
    if (!resource) return null;
    if (Date.now() - new Date(resource.cachedAt).getTime() > VDI_PURCHASE_RETRIEVAL_WINDOW_MS) return null;
    return resource.data;
  } catch {
    return null;
  }
}

export async function setCachedBuyingGuideLookup(vehicleKind: VehicleKind, vrm: string, data: CachedBuyingGuideLookupData): Promise<void> {
  const container = getContainer();
  const doc: BuyingGuideLookupCacheDoc = {
    id: cacheDocId(vehicleKind, vrm),
    pk: "system",
    type: "buyingGuideLookupCache",
    vehicleKind,
    vrm,
    cachedAt: new Date().toISOString(),
    data,
  };
  await container.items.upsert(doc);
}
