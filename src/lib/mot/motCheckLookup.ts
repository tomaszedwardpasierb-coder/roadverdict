// Place at: src/lib/mot/motCheckLookup.ts
//
// Gets a vehicle's MOT record for the free MOT check (/mot-check).
//
// Where it comes from is one setting, MOT_SOURCE:
//   "vdg" (the default for now) - Vehicle Data Global's MotHistoryDetails,
//     the same paid package the rest of the site uses.
//   "dvsa" - DVSA's own free MOT History API, once its key arrives. Not
//     connected yet: until it is, this falls back to VDG and logs why.
//
// Every record is cached for a day per registration, shared by everyone
// who checks that plate, so a popular plate costs one lookup a day.
import { getContainer } from "@/lib/cosmos";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { RawMotTest } from "@/lib/tracker/motHistory";
import { fromVdg, type MotRecord } from "./motRecord";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";
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

async function fetchFromVdg(registration: string): Promise<MotLookupResult> {
  const apiKey = process.env.VDG_API_KEY;
  if (!apiKey) {
    console.error("VDG_API_KEY is not configured.");
    return { status: "unavailable" };
  }
  try {
    const res = await fetchWithTimeout(`${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=MotHistoryDetails&vrm=${encodeURIComponent(registration)}`);
    const data = await res.json();
    const details = data?.Results?.MotHistoryDetails as
      | { Make?: string; Model?: string; FuelType?: string; Colour?: string; MotDueDate?: string | null; MotTestDetailsList?: RawMotTest[] }
      | undefined;
    if (!data?.ResponseInformation?.IsSuccessStatusCode || !details) return { status: "not_found" };
    return { status: "found", record: fromVdg(registration, details), cached: false };
  } catch (err) {
    // The error never includes the request URL, which carries the key.
    console.error("MOT check VDG lookup failed:", err instanceof Error ? err.message : "unknown error");
    return { status: "unavailable" };
  }
}

export function motSource(): "vdg" | "dvsa" {
  return process.env.MOT_SOURCE === "dvsa" ? "dvsa" : "vdg";
}

// A fresh lookup from the source - the caller checks the cache and the
// daily limits first (see /mot-check).
export async function freshMotLookup(registration: string): Promise<MotLookupResult> {
  if (motSource() === "dvsa") {
    console.warn("MOT_SOURCE is dvsa but the DVSA client isn't connected yet - using VDG.");
  }
  const result = await fetchFromVdg(registration);
  if (result.status === "found") await writeCache(registration, result.record);
  if (result.status === "not_found") await writeCache(registration, null);
  return result;
}
