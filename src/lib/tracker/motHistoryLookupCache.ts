// Place at: src/lib/tracker/motHistoryLookupCache.ts
//
// Global, plate-level cache for VDG's MotHistoryDetails package as used
// by the free "add a vehicle"/quote-checker flows - shared by
// quote-lookup and mot-history-preview, which otherwise each pay for
// their own identical VDG call (same package, same plate) whenever both
// happen to be used for the same registration. Same reasoning as
// buyingGuideLookupCache.ts: these are objective facts about the
// vehicle, true for whoever looks the plate up, so a repeated lookup
// shouldn't cost a second billed VDG call.
//
// Deliberately much shorter-lived than buyingGuideLookupCache.ts's
// 42-day window - that cache backs an editorial-style "preview" page
// where week-old MOT/tax data is an accepted trade-off; this one backs
// data that gets treated as current (pre-filling a new vehicle's record,
// judging a repair quote), so it only covers the same-session re-lookup
// case (a typo fix, a back button, switching between tools) rather than
// serving hours-old data as if it were fresh.
import { getContainer } from "@/lib/cosmos";
import type { ParsedMotTest } from "@/lib/tracker/motHistory";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface CachedMotHistoryLookup {
  make: string;
  model: string;
  fuelType: string;
  colour: string;
  plateInRetention: boolean;
  motDueDate: string | null;
  // Oldest-first, same convention as buyingGuideLookupCache.ts's
  // motTestsOldestFirst - each caller derives its own display order.
  motTestsOldestFirst: ParsedMotTest[];
}

interface MotHistoryLookupCacheDoc {
  id: string;
  pk: "system";
  type: "motHistoryLookupCache";
  vrm: string;
  cachedAt: string;
  data: CachedMotHistoryLookup;
}

function cacheDocId(vrm: string): string {
  return `motHistoryLookupCache::${vrm}`;
}

export async function getCachedMotHistoryLookup(vrm: string): Promise<CachedMotHistoryLookup | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(cacheDocId(vrm), "system").read<MotHistoryLookupCacheDoc>();
    if (!resource) return null;
    if (Date.now() - new Date(resource.cachedAt).getTime() > CACHE_TTL_MS) return null;
    return resource.data;
  } catch {
    return null;
  }
}

// See vehicleLookupCache.ts's identical note: a failed cache write must
// never turn an otherwise-good lookup response into an error.
export async function setCachedMotHistoryLookup(vrm: string, data: CachedMotHistoryLookup): Promise<void> {
  try {
    const container = getContainer();
    const doc: MotHistoryLookupCacheDoc = {
      id: cacheDocId(vrm),
      pk: "system",
      type: "motHistoryLookupCache",
      vrm,
      cachedAt: new Date().toISOString(),
      data,
    };
    await container.items.upsert(doc);
  } catch (err) {
    console.error("Failed to cache MOT history lookup:", err);
  }
}
