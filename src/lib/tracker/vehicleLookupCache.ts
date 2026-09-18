// Place at: src/lib/tracker/vehicleLookupCache.ts
//
// Global, plate-level cache for /api/tracker/plate-lookup's VDG
// VehicleDetails call - same reasoning as buyingGuideLookupCache.ts:
// make/model/year/colour/engine size are objective facts about the
// vehicle, true for whoever looks the plate up, so a repeated lookup of
// the same registration (a typo fix, a back button, a second person
// checking the same vehicle) shouldn't cost a second billed VDG call.
//
// Deliberately much shorter-lived than buyingGuideLookupCache.ts's
// 42-day window (see motHistoryLookupCache.ts's identical note): this
// backs the "add a vehicle" flow, where the win worth capturing is a
// plate re-checked minutes apart in the same session, not serving
// hour(s)-old data as if it were fresh.
import { getContainer } from "@/lib/cosmos";
import type { VehicleTypeCheck } from "@/lib/tracker/vehicleTypeCheck";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface CachedPlateLookup {
  make: string;
  model: string;
  year: number;
  fuelType: string;
  colour: string;
  engineCapacityCc: number | null;
  plateInRetention: boolean;
  vehicleType: VehicleTypeCheck;
}

interface VehicleLookupCacheDoc {
  id: string;
  pk: "system";
  type: "vehicleLookupCache";
  vrm: string;
  cachedAt: string;
  data: CachedPlateLookup;
}

function cacheDocId(vrm: string): string {
  return `vehicleLookupCache::${vrm}`;
}

export async function getCachedPlateLookup(vrm: string): Promise<CachedPlateLookup | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(cacheDocId(vrm), "system").read<VehicleLookupCacheDoc>();
    if (!resource) return null;
    if (Date.now() - new Date(resource.cachedAt).getTime() > CACHE_TTL_MS) return null;
    return resource.data;
  } catch {
    return null;
  }
}

// Caching is a pure speed/cost optimisation on top of a lookup that
// already succeeded - a failed cache write must never turn an otherwise-
// good response into an error, so failures are swallowed here rather
// than left to propagate to the route.
export async function setCachedPlateLookup(vrm: string, data: CachedPlateLookup): Promise<void> {
  try {
    const container = getContainer();
    const doc: VehicleLookupCacheDoc = {
      id: cacheDocId(vrm),
      pk: "system",
      type: "vehicleLookupCache",
      vrm,
      cachedAt: new Date().toISOString(),
      data,
    };
    await container.items.upsert(doc);
  } catch (err) {
    console.error("Failed to cache plate lookup:", err);
  }
}
