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

// Per-chart display preference - "which chart id maps to which chart
// type". Stored per-bike (same pattern as distanceUnit/currency below)
// rather than in the browser, so it follows the account across devices
// instead of being lost if browser data is cleared.
export type ChartKind = "line" | "bar" | "pie";

export type RegistrationChangeReason = "private-plate-assigned" | "private-plate-removed" | "correction" | "other";

export const REGISTRATION_CHANGE_REASON_LABELS: Record<RegistrationChangeReason, string> = {
  "private-plate-assigned": "Private plate assigned",
  "private-plate-removed": "Private plate removed (reverted)",
  correction: "Correcting an entry error",
  other: "Other",
};

// Append-only, forever - never edited or removed. A single change is
// completely normal (private plates exist); a long list of them, or one
// that landed suspiciously close to generating a sale report, is exactly
// the kind of fact a buyer should see plainly rather than have hidden
// behind whatever plate happens to be showing today.
export interface RegistrationChangeEntry {
  plate: string;
  reason: RegistrationChangeReason;
  changedAt: string;
}

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
  // Optional now - a genuine custom/kit build often has no single clean
  // answer (frame from one year, engine from another, built much later
  // than either) - isCustomBuild is what makes year optional instead of
  // required, not the absence of a value on its own.
  year?: number;
  isCustomBuild?: boolean;
  currentMileage: number;
  startingMileage: number;
  nickname: string;
  region?: Region;
  annualBudget?: number;
  // Optional - most people won't set this, so this stays a pure bonus
  // signal used only for guessing whether a fuel purchase was a full
  // tank. tankGuess.ts falls back to a sensible generic default when
  // it's unset, rather than requiring it before the feature works at all.
  tankCapacityLitres?: number;
  shareToken?: string;
  distanceUnit?: DistanceUnit;
  fuelEconomyUnit?: FuelEconomyUnit;
  currency?: Currency;
  chartTypes?: Record<string, ChartKind>;
  // Set once, at creation (or backfilled once for bikes added before this
  // existed) - never editable after that through any normal flow, not
  // even "edit bike". Optional on the type only because bikes created
  // before this feature existed don't have one yet until backfilled.
  originalRegistration?: string;
  // Every plate AFTER the original - append-only, see
  // RegistrationChangeEntry. The current plate is whichever is last here,
  // or originalRegistration itself if this is empty.
  registrationChanges?: RegistrationChangeEntry[];
  dateAdded: string;
}

// The plate a report/UI should actually display "as current" - the most
// recent change, or the original if it's never changed.
export function getCurrentRegistration(bike: BikeDoc): string | undefined {
  const changes = bike.registrationChanges ?? [];
  return changes.length > 0 ? changes[changes.length - 1].plate : bike.originalRegistration;
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
    year?: number;
    isCustomBuild?: boolean;
    registration: string;
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
    isCustomBuild: data.isCustomBuild,
    originalRegistration: data.registration,
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

export type SetOriginalRegistrationResult =
  | { ok: true; bike: BikeDoc }
  | { ok: false; reason: "not_found" | "already_set" };

// One-time only, for bikes that existed before this feature did. Refuses
// outright if originalRegistration is already set - defense in depth on
// top of the API route's own check, so this can never be called twice to
// quietly overwrite what's meant to be permanent.
export async function setOriginalRegistration(
  email: string,
  bikeId: string,
  registration: string
): Promise<SetOriginalRegistrationResult> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return { ok: false, reason: "not_found" };
  if (resource.originalRegistration) return { ok: false, reason: "already_set" };
  resource.originalRegistration = registration;
  await container.items.upsert(resource);
  return { ok: true, bike: resource };
}

// Appends to the permanent history - never overwrites originalRegistration
// or any prior change. This is the only sanctioned way a bike's current
// plate can change after creation; there is deliberately no plain "edit"
// path for it.
export async function addRegistrationChange(
  email: string,
  bikeId: string,
  plate: string,
  reason: RegistrationChangeReason
): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return null;
  const entry: RegistrationChangeEntry = { plate, reason, changedAt: new Date().toISOString() };
  resource.registrationChanges = [...(resource.registrationChanges ?? []), entry];
  await container.items.upsert(resource);
  return resource;
}

// Permanently deletes a bike and every record that belongs to it - there
// is no "undo" here by design, matched by a confirmation dialog on the
// client before this is ever called. Deletes the bike's share-link doc
// too if it has one (that lives in a different partition, keyed by
// token, so it needs its own explicit delete - it wouldn't be caught by
// deleting the bike's own partition).
export async function deleteBike(email: string, bikeId: string): Promise<void> {
  const container = getContainer();

  const { resource: bike } = await container.item(bikeId, email).read<BikeDoc>();

  const recordTypes = ["serviceRecord", "fuelLog", "mod", "bill", "reminder"];
  for (const type of recordTypes) {
    const { resources } = await container.items
      .query<{ id: string }>(
        {
          query: "SELECT c.id FROM c WHERE c.type = @type AND c.bikeId = @bikeId",
          parameters: [
            { name: "@type", value: type },
            { name: "@bikeId", value: bikeId },
          ],
        },
        { partitionKey: email }
      )
      .fetchAll();
    for (const r of resources) {
      await container.item(r.id, email).delete();
    }
  }

  if (bike?.shareToken) {
    try {
      await container.item(bike.shareToken, bike.shareToken).delete();
    } catch {
      // Already gone or never existed - not a reason to fail the whole deletion.
    }
  }

  await container.item(bikeId, email).delete();
}

// Updates a single chart's type preference without disturbing any other
// chart's saved preference - reads the existing map, sets one key, merges
// back in, rather than replacing the whole map each time.
export async function updateBikeChartType(
  email: string,
  bikeId: string,
  chartId: string,
  kind: ChartKind
): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return null;
  resource.chartTypes = { ...(resource.chartTypes ?? {}), [chartId]: kind };
  await container.items.upsert(resource);
  return resource;
}
