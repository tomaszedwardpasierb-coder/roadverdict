// Place at: src/lib/tracker/bike.ts
import { cookies } from "next/headers";
import { getContainer } from "@/lib/cosmos";
import type { BikeClass, Region } from "@/lib/priceData";
import type { DistanceUnit, FuelEconomyUnit } from "@/lib/tracker/unitFormat";
import type { Currency } from "@/lib/tracker/currency";

// Free-tier cap. No paid tier exists yet - when it does, the natural
// extension point is a `plan` field on some account-level doc, checked
// alongside this constant, not a rewrite of the cap logic itself.
export const MAX_FREE_BIKES = 2;

// Which bike a browser is currently "looking at" - set by the bike
// switcher / garage page, read here to resolve every request. A UI
// preference, not an auth token, so it doesn't need to be short-lived.
export const ACTIVE_BIKE_COOKIE = "activeBikeId";

// Unique per bike, unlike the old `${email}::bike` scheme this replaces.
// The old scheme meant a second createBike() call would silently
// overwrite the first bike's document (same id, upsert just replaces) -
// this is the actual fix for that. The random suffix guards against the
// theoretical case of two bikes being created in the same millisecond.
function generateBikeId(email: string): string {
  return `${email}::bike::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`;
}

export interface BikeDoc {
  id: string;
  pk: string;
  type: "bike";
  make: string;
  model: string;
  engineCC: number;
  bikeClass: BikeClass;
  year: number;
  currentMileage: number;
  startingMileage: number;
  nickname: string;
  region?: Region;
  annualBudget?: number;
  shareToken?: string;
  distanceUnit?: DistanceUnit;
  fuelEconomyUnit?: FuelEconomyUnit;
  currency?: Currency;
  dateAdded: string;
}

// Lists every bike doc in a user's partition, oldest first. There's only
// ever one today for existing accounts (their original bike, still using
// the old `email::bike` id from before this change - that's fine, this
// query doesn't care about id format, only the `type` field).
export async function getBikesForUser(email: string): Promise<BikeDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<BikeDoc>(
      {
        query: "SELECT * FROM c WHERE c.type = 'bike' ORDER BY c.dateAdded ASC",
      },
      { partitionKey: email }
    )
    .fetchAll();
  return resources;
}

// Resolves which of a given list of bikes is "active" - the one set via
// the bike switcher/garage page, falling back to the first (oldest) bike
// if no cookie is set, or if the cookie points to a bike not in this
// list (e.g. stale after switching accounts). Takes the list as a
// parameter rather than querying itself, so callers that already have
// the full list (like the garage page) don't pay for a second query.
export async function pickActiveBike(bikes: BikeDoc[]): Promise<BikeDoc | null> {
  if (bikes.length === 0) return null;
  const cookieStore = await cookies();
  const activeId = cookieStore.get(ACTIVE_BIKE_COOKIE)?.value;
  if (activeId) {
    const match = bikes.find((b) => b.id === activeId);
    if (match) return match;
  }
  return bikes[0];
}

// Resolves which bike a request should act on. Every existing call site
// (dashboard page, every tracker API route) already calls this - keeping
// the same name and signature here means the switcher becomes "live"
// everywhere at once, with zero changes needed to those 13+ files.
export async function getPrimaryBike(email: string): Promise<BikeDoc | null> {
  const bikes = await getBikesForUser(email);
  return pickActiveBike(bikes);
}

export async function getBike(email: string, bikeId: string): Promise<BikeDoc | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(bikeId, email).read<BikeDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export type CreateBikeResult =
  | { ok: true; bike: BikeDoc }
  | { ok: false; reason: "limit_reached"; limit: number };

export async function createBike(
  email: string,
  data: {
    make: string;
    model: string;
    engineCC: number;
    bikeClass: BikeClass;
    year: number;
    currentMileage: number;
    nickname: string;
    region: Region;
  }
): Promise<CreateBikeResult> {
  const existing = await getBikesForUser(email);
  if (existing.length >= MAX_FREE_BIKES) {
    return { ok: false, reason: "limit_reached", limit: MAX_FREE_BIKES };
  }

  const container = getContainer();
  const doc: BikeDoc = {
    id: generateBikeId(email),
    pk: email,
    type: "bike",
    make: data.make,
    model: data.model,
    engineCC: data.engineCC,
    bikeClass: data.bikeClass,
    year: data.year,
    currentMileage: data.currentMileage,
    startingMileage: data.currentMileage,
    nickname: data.nickname,
    region: data.region,
    dateAdded: new Date().toISOString().slice(0, 10),
  };
  await container.items.upsert(doc);
  return { ok: true, bike: doc };
}

export async function updateBikeMileage(email: string, bikeId: string, newMileage: number): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return null;
  resource.currentMileage = newMileage;
  await container.items.upsert(resource);
  return resource;
}

export async function updateBikeRegion(email: string, bikeId: string, region: Region): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return null;
  resource.region = region;
  await container.items.upsert(resource);
  return resource;
}

export async function updateBikeBudget(email: string, bikeId: string, annualBudget: number): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return null;
  resource.annualBudget = annualBudget;
  await container.items.upsert(resource);
  return resource;
}

export async function updateBikeShareToken(email: string, bikeId: string, shareToken: string): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return null;
  resource.shareToken = shareToken;
  await container.items.upsert(resource);
  return resource;
}

export async function updateBikeUnits(
  email: string,
  bikeId: string,
  distanceUnit?: DistanceUnit,
  fuelEconomyUnit?: FuelEconomyUnit
): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return null;
  if (distanceUnit) resource.distanceUnit = distanceUnit;
  if (fuelEconomyUnit) resource.fuelEconomyUnit = fuelEconomyUnit;
  await container.items.upsert(resource);
  return resource;
}

export async function updateBikeCurrency(email: string, bikeId: string, currency: Currency): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return null;
  resource.currency = currency;
  await container.items.upsert(resource);
  return resource;
}
