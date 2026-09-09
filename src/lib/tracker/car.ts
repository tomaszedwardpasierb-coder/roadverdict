// Place at: src/lib/tracker/car.ts
//
// The car equivalent of bike.ts - sister schema, not a shared one (see
// RoadVerdict_Car_Plan_v3.md's Architecture Decision Record for why).
// Deliberately narrower than BikeDoc in a few places: no shareToken,
// includeInsuranceInReport/includeFinanceInReport, storyCache, or
// transferredFrom/transferredTo - those all belong to features
// (buyer report, Story So Far, ownership transfer) that are explicit
// out-of-scope items for this build. Adding them later is additive and
// safe; carrying them now with nothing to write or read them is dead
// weight.
import { cookies } from "next/headers";
import { getContainer } from "@/lib/cosmos";
import { stripCosmosMetadata, type TrackerDocBase } from "@/lib/tracker/cosmosHelpers";
import type { Region } from "@/lib/priceData";
import type { DistanceUnit, FuelEconomyUnit } from "@/lib/tracker/unitFormat";
import type { Currency } from "@/lib/tracker/currency";
import type { ChartKind, DvlaVehicleData, RegistrationChangeEntry, RegistrationChangeReason } from "@/lib/tracker/bike";

export type CarFuelType = "petrol" | "diesel" | "hybrid" | "phev" | "electric";
export type CarSizeClass = "small" | "medium" | "large" | "electric";

// Mirrors ACTIVE_BIKE_COOKIE - a separate cookie, not a shared one, so
// switching the active car never disturbs which bike is active and vice
// versa. Both can be set at once; which one a given page reads depends
// on which vehicle kind is in view there.
export const ACTIVE_CAR_COOKIE = "activeCarId";

export function generateCarId(email: string): string {
  return `${email}::car::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`;
}

// A transferred car is read-only going forward - same semantics as
// isBikeReadOnly, kept even though car ownership transfer itself isn't
// built yet (see bike.ts's own comment on this pattern): every future
// write-path route can check this from day one rather than needing a
// retrofit once transfer eventually ships. transferredTo simply never
// gets set today, so this always returns false in practice for now.
export const CAR_READ_ONLY_MESSAGE = "This car has been transferred and is now read-only.";

export function isCarReadOnly(car: CarDoc): boolean {
  return !!car.transferredTo;
}

export function countActiveCars(cars: CarDoc[]): number {
  return cars.filter((c) => !isCarReadOnly(c)).length;
}

export interface CarDoc {
  id: string;
  pk: string;
  type: "car";
  make: string;
  model: string;
  // Mandatory from creation, unlike most other fields here - see the
  // ADR: this is the one field every downstream feature (fuel form,
  // receipt scanning, the assistant's own answers) branches on, so
  // there is no safe "unknown" state to allow.
  fuelType: CarFuelType;
  // Absent for electric; present for ICE/hybrid/PHEV. Litres, not cc -
  // DVLA and buyers alike think in litres for cars.
  engineLitres?: number;
  // Absent for ICE; present for electric/PHEV.
  batteryKwh?: number;
  year?: number;
  isCustomBuild?: boolean;
  currentMileage: number;
  startingMileage: number;
  nickname: string;
  region?: Region;
  annualBudget?: number;
  distanceUnit?: DistanceUnit;
  fuelEconomyUnit?: FuelEconomyUnit;
  currency?: Currency;
  chartTypes?: Record<string, ChartKind>;
  originalRegistration?: string;
  registrationChanges?: RegistrationChangeEntry[];
  dvlaData?: DvlaVehicleData;
  dateAdded: string;
  // Set when this car was added despite the registration already having
  // a RoadVerdict record under a different account - see bike.ts's own
  // field of the same name for the full reasoning, unchanged here.
  mayHavePriorHistory?: boolean;
  // Never set by anything in this build yet (car ownership transfer is
  // out of scope) - present only so isCarReadOnly/countActiveCars above
  // have a real field to check, matching bike.ts's own shape, without
  // needing a later breaking change to add it.
  transferredTo?: {
    newCarId: string;
    newOwnerEmail: string;
    transferredAt: string;
  };
}

export function getCurrentRegistration(car: CarDoc): string | undefined {
  const changes = car.registrationChanges ?? [];
  return changes.length > 0 ? changes[changes.length - 1].plate : car.originalRegistration;
}

export async function getCarsForUser(email: string): Promise<CarDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<CarDoc>(
      { query: "SELECT * FROM c WHERE c.type = 'car' ORDER BY c.dateAdded ASC" },
      { partitionKey: email }
    )
    .fetchAll();
  return resources.map(stripCosmosMetadata);
}

// Cross-partition, same accepted exception as findBikeByRegistrationAcrossAccounts -
// cars are stored one-per-owner partition, so this has no single
// partition to scope to. Only ever called from the add-car flow.
export async function findCarByRegistrationAcrossAccounts(
  registration: string
): Promise<{ ownerEmail: string; carId: string } | null> {
  const normalized = registration.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;

  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string; pk: string; transferredTo?: unknown }>({
      query:
        "SELECT c.id, c.pk, c.transferredTo FROM c WHERE c.type = 'car' AND (UPPER(REPLACE(c.originalRegistration, ' ', '')) = @reg OR EXISTS(SELECT VALUE rc FROM rc IN c.registrationChanges WHERE UPPER(REPLACE(rc.plate, ' ', '')) = @reg))",
      parameters: [{ name: "@reg", value: normalized }],
    })
    .fetchAll();

  if (resources.length === 0) return null;
  const active = resources.find((r) => !r.transferredTo);
  const match = active ?? resources[0];
  return { ownerEmail: match.pk, carId: match.id };
}

export async function pickActiveCar(cars: CarDoc[]): Promise<CarDoc | null> {
  if (cars.length === 0) return null;
  const cookieStore = await cookies();
  const activeId = cookieStore.get(ACTIVE_CAR_COOKIE)?.value;
  if (activeId) {
    const match = cars.find((c) => c.id === activeId);
    if (match) return match;
  }
  return cars[0];
}

export async function getPrimaryCar(email: string): Promise<CarDoc | null> {
  const cars = await getCarsForUser(email);
  return pickActiveCar(cars);
}

export async function getCarById(email: string, carId: string): Promise<CarDoc | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(carId, email).read<CarDoc>();
    return resource ? stripCosmosMetadata(resource) : null;
  } catch {
    return null;
  }
}

export async function createCar(
  email: string,
  data: {
    make: string;
    model: string;
    fuelType: CarFuelType;
    engineLitres?: number;
    batteryKwh?: number;
    year?: number;
    isCustomBuild?: boolean;
    registration: string;
    currentMileage: number;
    nickname: string;
    region: Region;
    mayHavePriorHistory?: boolean;
  }
): Promise<CarDoc> {
  const container = getContainer();
  const doc: CarDoc = {
    id: generateCarId(email),
    pk: email,
    type: "car",
    make: data.make,
    model: data.model,
    fuelType: data.fuelType,
    engineLitres: data.engineLitres,
    batteryKwh: data.batteryKwh,
    year: data.year,
    isCustomBuild: data.isCustomBuild,
    originalRegistration: data.registration,
    currentMileage: data.currentMileage,
    startingMileage: data.currentMileage,
    nickname: data.nickname,
    region: data.region,
    dateAdded: new Date().toISOString().slice(0, 10),
    mayHavePriorHistory: data.mayHavePriorHistory,
  };
  await container.items.upsert(doc);
  return doc;
}

export async function updateCarMileage(email: string, carId: string, newMileage: number): Promise<CarDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(carId, email).read<CarDoc>();
  if (!resource) return null;
  resource.currentMileage = newMileage;
  await container.items.upsert(resource);
  return resource;
}

export async function updateCarDvlaData(email: string, carId: string, dvlaData: DvlaVehicleData): Promise<CarDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(carId, email).read<CarDoc>();
  if (!resource) return null;
  resource.dvlaData = dvlaData;
  await container.items.upsert(resource);
  return resource;
}

export async function updateCarRegion(email: string, carId: string, region: Region): Promise<CarDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(carId, email).read<CarDoc>();
  if (!resource) return null;
  resource.region = region;
  await container.items.upsert(resource);
  return resource;
}

export async function updateCarBudget(email: string, carId: string, annualBudget: number): Promise<CarDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(carId, email).read<CarDoc>();
  if (!resource) return null;
  resource.annualBudget = annualBudget;
  await container.items.upsert(resource);
  return resource;
}

export async function updateCarUnits(
  email: string,
  carId: string,
  distanceUnit?: DistanceUnit,
  fuelEconomyUnit?: FuelEconomyUnit
): Promise<CarDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(carId, email).read<CarDoc>();
  if (!resource) return null;
  if (distanceUnit) resource.distanceUnit = distanceUnit;
  if (fuelEconomyUnit) resource.fuelEconomyUnit = fuelEconomyUnit;
  await container.items.upsert(resource);
  return resource;
}

export async function updateCarCurrency(email: string, carId: string, currency: Currency): Promise<CarDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(carId, email).read<CarDoc>();
  if (!resource) return null;
  resource.currency = currency;
  await container.items.upsert(resource);
  return resource;
}

export async function addCarRegistrationChange(
  email: string,
  carId: string,
  plate: string,
  reason: RegistrationChangeReason
): Promise<CarDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(carId, email).read<CarDoc>();
  if (!resource) return null;
  const entry: RegistrationChangeEntry = { plate, reason, changedAt: new Date().toISOString() };
  resource.registrationChanges = [...(resource.registrationChanges ?? []), entry];
  await container.items.upsert(resource);
  return resource;
}

export async function updateCarChartType(email: string, carId: string, chartId: string, kind: ChartKind): Promise<CarDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(carId, email).read<CarDoc>();
  if (!resource) return null;
  resource.chartTypes = { ...(resource.chartTypes ?? {}), [chartId]: kind };
  await container.items.upsert(resource);
  return resource;
}

// Permanently deletes a car and every record that belongs to it -
// mirrors deleteBike exactly, own record-type list (carServiceRecord/
// carFuelLog/carMod/carBill/carLabour/carReminder), no shareToken to
// clean up since cars don't have one yet.
export async function deleteCar(email: string, carId: string): Promise<void> {
  const container = getContainer();
  const recordTypes = ["carServiceRecord", "carFuelLog", "carMod", "carBill", "carLabour", "carReminder"];
  await Promise.all(
    recordTypes.map(async (type) => {
      const { resources } = await container.items
        .query<{ id: string }>(
          {
            query: "SELECT c.id FROM c WHERE c.type = @type AND c.carId = @carId",
            parameters: [
              { name: "@type", value: type },
              { name: "@carId", value: carId },
            ],
          },
          { partitionKey: email }
        )
        .fetchAll();
      await Promise.all(resources.map((r) => container.item(r.id, email).delete()));
    })
  );
  await container.item(carId, email).delete();
}

// The car equivalent of queryTrackerDocs (cosmosHelpers.ts) - not added
// to that file, deliberately: queryTrackerDocs hardcodes `c.bikeId`,
// and this app's other generic tracker helpers (createTrackerDoc,
// updateTrackerDoc, deleteTrackerDoc) don't reference bikeId at all, so
// they're already reusable as-is for car records with no change needed.
// Only the query needs a car-specific twin. Every car record type
// interface below adds its own required `carId: string` field beyond
// TrackerDocBase for this to filter on.
export async function queryCarTrackerDocs<TDoc extends TrackerDocBase & { carId: string }>(
  email: string,
  type: string,
  carId: string
): Promise<TDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<TDoc>(
      {
        query: "SELECT * FROM c WHERE c.type = @type AND c.carId = @carId ORDER BY c.date DESC",
        parameters: [
          { name: "@type", value: type },
          { name: "@carId", value: carId },
        ],
      },
      { partitionKey: email }
    )
    .fetchAll();
  return resources.map(stripCosmosMetadata);
}
