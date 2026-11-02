// Place at: src/lib/mot/motCheckLookup.ts
//
// Gets a vehicle's MOT record for the free MOT check (/mot-check).
//
// Where it comes from is motHistorySource.ts's job, shared with every
// other MOT lookup on the site: DVSA's free MOT History API when
// MOT_SOURCE=dvsa (VDG if DVSA is down), otherwise VDG's paid package.
//
// Every record is cached for a day per registration, shared by everyone
// who checks that plate, so a popular plate costs one lookup a day.
import { getContainer } from "@/lib/cosmos";
import { fromVdg, type MotRecord } from "./motRecord";
import { fetchMotHistoryDetails } from "./motHistorySource";

export { motSource } from "./motHistorySource";

const CACHE_TTL_SECONDS = 24 * 60 * 60;
const PK = "system";

export type MotLookupResult =
  | { status: "found"; record: MotRecord; cached: boolean }
  | { status: "not_found" }
  | { status: "unavailable" };

interface MotCheckCacheDoc {
  id: string;
  pk: typeof PK;
  type: "motCheckCache";
  registration: string;
  cachedAt: string;
  // null records a lookup that found nothing, so a mistyped plate that
  // keeps being checked doesn't keep costing a lookup either.
  record: MotRecord | null;
  ttl: number;
}

function cacheId(registration: string): string {
  return `motCheckCache::${registration}`;
}

async function readCache(registration: string): Promise<MotCheckCacheDoc | null> {
  try {
    const { resource } = await getContainer().item(cacheId(registration), PK).read<MotCheckCacheDoc>();
    if (!resource) return null;
    if (Date.now() - new Date(resource.cachedAt).getTime() > CACHE_TTL_SECONDS * 1000) return null;
    return resource;
  } catch {
    return null;
  }
}

async function writeCache(registration: string, record: MotRecord | null): Promise<void> {
  try {
    await getContainer().items.upsert({
      id: cacheId(registration),
      pk: PK,
      type: "motCheckCache",
      registration,
      cachedAt: new Date().toISOString(),
      record,
      ttl: CACHE_TTL_SECONDS,
    } satisfies MotCheckCacheDoc);
  } catch (err) {
    console.error("MOT check cache write failed:", err);
  }
}

export async function cachedMotLookup(registration: string): Promise<MotLookupResult | null> {
  const hit = await readCache(registration);
  if (!hit) return null;
  return hit.record ? { status: "found", record: hit.record, cached: true } : { status: "not_found" };
}

async function fetchRecord(registration: string): Promise<MotLookupResult> {
  const lookup = await fetchMotHistoryDetails(registration);
  if (lookup.status !== "found") return lookup;
  // Either source arrives in VDG's shape (see dvsaMot.ts); the record
  // says which one it really was.
  return { status: "found", record: { ...fromVdg(registration, lookup.details), source: lookup.source }, cached: false };
}

// A fresh lookup from the source - the caller checks the cache and the
// daily limits first (see /mot-check).
export async function freshMotLookup(registration: string): Promise<MotLookupResult> {
  const result = await fetchRecord(registration);
  if (result.status === "found") await writeCache(registration, result.record);
  if (result.status === "not_found") await writeCache(registration, null);
  return result;
}
