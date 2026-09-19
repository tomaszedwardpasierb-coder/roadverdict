// Place at: src/lib/fuelPrice.ts
import { getContainer } from "./cosmos";

// Single shared record, not per-user - lives in its own fixed partition
// so it never competes with real user data.
const FUEL_PRICE_DOC_ID = "fuelPrice";
const FUEL_PRICE_PK = "system";

// Hardcoded fallback if the stored value is ever unreadable (Cosmos DB
// down, doc missing, weekly cron hasn't run yet on a fresh deploy).
// This was the manually-checked constant before this became
// self-updating - kept here as a safety net, not the primary source
// of truth anymore. Sourced 13/07/2026 from DESNZ's weekly road fuel
// prices CSV: https://www.gov.uk/government/statistics/weekly-road-fuel-prices
const FALLBACK_PETROL_PRICE_PENCE_PER_LITRE = 150.53;

export interface FuelPriceRecord {
  id: string;
  pk: string;
  type: "fuelPrice";
  pricePenceLitre: number;
  weekCommencing: string; // e.g. "13/07/2026", as published by DESNZ
  fetchedAt: string; // ISO timestamp of when the cron last updated this
}

// Both prices only change once a week via the DESNZ cron, but this is
// read on the cost calculators and every cost-calculation on the
// dashboard - a plain in-process TTL cache removes the fixed
// per-call Cosmos round trip for the vast majority of reads. The
// save functions below update the cache directly too, so a cron run
// is reflected immediately rather than waiting out the TTL.
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let petrolCache: { price: number; fetchedAt: number } | null = null;
let dieselCache: { price: number; fetchedAt: number } | null = null;

export async function getCurrentPetrolPricePenceLitre(): Promise<number> {
  if (petrolCache && Date.now() - petrolCache.fetchedAt < CACHE_TTL_MS) {
    return petrolCache.price;
  }
  try {
    const container = getContainer();
    const { resource } = await container
      .item(FUEL_PRICE_DOC_ID, FUEL_PRICE_PK)
      .read<FuelPriceRecord>();
    if (resource && typeof resource.pricePenceLitre === "number") {
      petrolCache = { price: resource.pricePenceLitre, fetchedAt: Date.now() };
      return petrolCache.price;
    }
  } catch {
    // Doc doesn't exist yet, or Cosmos is unreachable - fall through
    // to the hardcoded fallback below rather than throwing. Not
    // cached, so the next call retries against Cosmos.
  }
  return FALLBACK_PETROL_PRICE_PENCE_PER_LITRE;
}

export async function saveCurrentPetrolPrice(
  pricePenceLitre: number,
  weekCommencing: string
): Promise<void> {
  const container = getContainer();
  const record: FuelPriceRecord = {
    id: FUEL_PRICE_DOC_ID,
    pk: FUEL_PRICE_PK,
    type: "fuelPrice",
    pricePenceLitre,
    weekCommencing,
    fetchedAt: new Date().toISOString(),
  };
  await container.items.upsert(record);
  petrolCache = { price: pricePenceLitre, fetchedAt: Date.now() };
}

// Diesel equivalent, for the car cost calculator (motorcycles are
// effectively all petrol, so the bike side never needed this). Same
// single-shared-doc pattern, own doc id so it never collides with the
// petrol record, same weekly DESNZ CSV as its source (see
// update-fuel-price/route.ts, which already downloads this file and
// discards the diesel column today).
const DIESEL_PRICE_DOC_ID = "dieselPrice";

// Sourced 13/07/2026 from the same DESNZ weekly road fuel prices CSV as
// the petrol fallback above - kept as a safety net, not the primary
// source of truth once the cron has run at least once.
const FALLBACK_DIESEL_PRICE_PENCE_PER_LITRE = 157.82;

export async function getCurrentDieselPricePenceLitre(): Promise<number> {
  if (dieselCache && Date.now() - dieselCache.fetchedAt < CACHE_TTL_MS) {
    return dieselCache.price;
  }
  try {
    const container = getContainer();
    const { resource } = await container
      .item(DIESEL_PRICE_DOC_ID, FUEL_PRICE_PK)
      .read<FuelPriceRecord>();
    if (resource && typeof resource.pricePenceLitre === "number") {
      dieselCache = { price: resource.pricePenceLitre, fetchedAt: Date.now() };
      return dieselCache.price;
    }
  } catch {
    // Doc doesn't exist yet, or Cosmos is unreachable - fall through
    // to the hardcoded fallback below rather than throwing. Not
    // cached, so the next call retries against Cosmos.
  }
  return FALLBACK_DIESEL_PRICE_PENCE_PER_LITRE;
}

export async function saveCurrentDieselPrice(
  pricePenceLitre: number,
  weekCommencing: string
): Promise<void> {
  const container = getContainer();
  const record: FuelPriceRecord = {
    id: DIESEL_PRICE_DOC_ID,
    pk: FUEL_PRICE_PK,
    type: "fuelPrice",
    pricePenceLitre,
    weekCommencing,
    fetchedAt: new Date().toISOString(),
  };
  await container.items.upsert(record);
  dieselCache = { price: pricePenceLitre, fetchedAt: Date.now() };
}
