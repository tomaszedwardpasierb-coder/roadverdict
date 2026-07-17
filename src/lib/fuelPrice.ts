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

export async function getCurrentPetrolPricePenceLitre(): Promise<number> {
  try {
    const container = getContainer();
    const { resource } = await container
      .item(FUEL_PRICE_DOC_ID, FUEL_PRICE_PK)
      .read<FuelPriceRecord>();
    if (resource && typeof resource.pricePenceLitre === "number") {
      return resource.pricePenceLitre;
    }
  } catch {
    // Doc doesn't exist yet, or Cosmos is unreachable - fall through
    // to the hardcoded fallback below rather than throwing.
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
}
