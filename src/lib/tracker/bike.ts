// Place at: src/lib/tracker/bike.ts
import { getContainer } from "@/lib/cosmos";
import type { BikeClass, Region } from "@/lib/priceData";
import type { DistanceUnit, FuelEconomyUnit } from "@/lib/tracker/unitFormat";

function bikeDocId(email: string): string {
  return `${email}::bike`;
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
  dateAdded: string;
}

export async function getBike(email: string): Promise<BikeDoc | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(bikeDocId(email), email).read<BikeDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

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
): Promise<BikeDoc> {
  const container = getContainer();
  const doc: BikeDoc = {
    id: bikeDocId(email),
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
  return doc;
}

export async function updateBikeMileage(email: string, newMileage: number): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeDocId(email), email).read<BikeDoc>();
  if (!resource) return null;
  resource.currentMileage = newMileage;
  await container.items.upsert(resource);
  return resource;
}

export async function updateBikeRegion(email: string, region: Region): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeDocId(email), email).read<BikeDoc>();
  if (!resource) return null;
  resource.region = region;
  await container.items.upsert(resource);
  return resource;
}

export async function updateBikeBudget(email: string, annualBudget: number): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeDocId(email), email).read<BikeDoc>();
  if (!resource) return null;
  resource.annualBudget = annualBudget;
  await container.items.upsert(resource);
  return resource;
}

export async function updateBikeShareToken(email: string, shareToken: string): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeDocId(email), email).read<BikeDoc>();
  if (!resource) return null;
  resource.shareToken = shareToken;
  await container.items.upsert(resource);
  return resource;
}

export async function updateBikeUnits(
  email: string,
  distanceUnit?: DistanceUnit,
  fuelEconomyUnit?: FuelEconomyUnit
): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeDocId(email), email).read<BikeDoc>();
  if (!resource) return null;
  if (distanceUnit) resource.distanceUnit = distanceUnit;
  if (fuelEconomyUnit) resource.fuelEconomyUnit = fuelEconomyUnit;
  await container.items.upsert(resource);
  return resource;
}
