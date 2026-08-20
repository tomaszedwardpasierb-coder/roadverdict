// Place at: src/lib/tracker/bike.ts
import { cookies } from "next/headers";
import { getContainer } from "@/lib/cosmos";
import type { BikeClass, Region } from "@/lib/priceData";
import type { DistanceUnit, FuelEconomyUnit } from "@/lib/tracker/unitFormat";
import type { Currency } from "@/lib/tracker/currency";
import type { BikeIdentity, CategorySpend } from "@/lib/tracker/storyFacts";

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
export function generateBikeId(email: string): string {
  return `${email}::bike::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`;
}

// A transferred bike is read-only going forward - the old owner's copy
// freezes at the moment of handover rather than staying live. Every
// route that writes bike-associated data (services, fuel, mods, bills,
// reminders, bike edits, mileage updates) should call this right after
// fetching the bike and before making any change, returning this
// message with a 403 if it's true. See bikeTransfer.ts for where
// transferredTo actually gets set.
export const BIKE_READ_ONLY_MESSAGE = "This bike has been transferred and is now read-only.";

export function isBikeReadOnly(bike: BikeDoc): boolean {
  return !!bike.transferredTo;
}

// A read-only, transferred bike is a historical record kept for its
// previous owner's own reference - it isn't something actively being
// tracked day to day, so it shouldn't count against the free-bike
// limit, which exists to cap how many bikes someone is actively
// managing, not how much history they've accumulated over time.
// Every place that checks or displays the limit should count through
// this, not bikes.length directly.
export function countActiveBikes(bikes: BikeDoc[]): number {
  return bikes.filter((b) => !isBikeReadOnly(b)).length;
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
  // A best-effort snapshot from DVLA/DVSA data (via VDG's VehicleDetails
  // package - the same one plate-lookup already calls), taken at bike
  // creation. Optional and non-blocking by nature: absence just means
  // the fetch didn't happen or didn't find anything, never a reason to
  // fail bike creation itself. See dvlaDataFetch.ts for how this gets
  // populated.
  dvlaData?: DvlaVehicleData;
  // Caches the last AI-generated Story So Far result, capped at one
  // real generation per week to avoid burning an AI call every time
  // someone just wants to re-read their own story. Absent until the
  // first generation. See src/app/api/tracker/story-so-far/route.ts
  // for the cooldown check that reads this.
  storyCache?: {
    generatedAt: string;
    response: {
      generatedWithAi: boolean;
      sharedStory: string[];
      ownerNotes: string[];
      verdict: { tier: string; label: string; reasons: string[] };
      identity: BikeIdentity;
      categorySpend: CategorySpend[];
    };
  };
  // Same reasoning and same weekly cap as storyCache above, but for the
  // dealer's-read opinion shown on the buyer-facing shareable report
  // (/report/[token]/detailed) - that page has no rate limit of its own
  // and can be viewed by anyone with the link, any number of times, so
  // without this cache an AI call would fire on every single page load.
  buyerOpinionCache?: {
    generatedAt: string;
    response: {
      strengths: string[];
      concerns: string[];
      honestRead: string;
    };
  };
  // Set on a NEW bike document when it was created by transferring
  // ownership from a previous account, rather than added fresh by this
  // owner. Points back at the old document under the previous owner's
  // partition - deliberately a link between two documents, not a
  // change of owner on one document, since bikes here are partitioned
  // by owner email and can't move partitions in place. See
  // bikeTransfer.ts for the function that creates this pair.
  transferredFrom?: {
    previousBikeId: string;
    previousOwnerEmail: string;
    transferredAt: string;
    // Frozen at the moment of transfer, not a live figure - the new
    // owner doesn't inherit the previous owner's actual service/fuel/
    // bill records (those stay under the previous owner's account
    // unless explicitly shared - see Phase 3 of the digital passport
    // plan), only this snapshot of what they added up to.
    summaryAtTransfer: {
      totalEntries: number;
      totalSpend: number;
      documentationVerdictLabel: string;
      mileageAtTransfer: number;
    };
  };
  // Set on the OLD bike document once it's been superseded by a
  // transfer - the presence of this field is what makes a bike
  // historical/read-only rather than a separate boolean flag. Points
  // forward at the new owner's copy.
  transferredTo?: {
    newBikeId: string;
    newOwnerEmail: string;
    transferredAt: string;
  };
}

export interface DvlaKeeperChange {
  numberOfPreviousKeepers: number;
  keeperStartDate: string;
  previousKeeperDisposalDate: string | null;
}

export interface DvlaPlateChange {
  currentVrm: string;
  previousVrm: string;
  dateOfTransaction: string;
}

export interface DvlaVehicleData {
  fetchedAt: string;
  // DVLA's own live current VRM at the moment of lookup - the direct
  // field for cross-checking against RoadVerdict's own recorded current
  // plate, rather than inferring it from plateChangeList's ordering.
  dvlaCurrentVrm?: string;
  isImported?: boolean;
  isExported?: boolean;
  isScrapped?: boolean;
  isUnscrapped?: boolean;
  cherishedTransferMarker?: boolean;
  keeperChangeList: DvlaKeeperChange[];
  // DVLA's own plate-change record - distinct from this bike's own
  // registrationChanges above (which is RoadVerdict's user-entered
  // history). Kept separate deliberately so the two can be cross-checked
  // against each other rather than one silently overwriting the other.
  plateChangeList: DvlaPlateChange[];
  v5cIssueDates: string[];
  officialCombinedMpg?: number;
  euroStatus?: string;
  dateFirstRegistered?: string;
  fuelTankCapacityLitres?: number;
  powerBhp?: number;
  powerRpm?: number;
  torqueNm?: number;
  warrantyMonths?: number;
  warrantyMiles?: number;
  countryOfOrigin?: string;
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

// Cross-partition, same accepted exception used elsewhere in this app
// for genuinely cross-account lookups - bikes are stored one-per-owner
// partition, so "does this registration exist anywhere at all" has no
// single partition to scope to. Only ever called from the add-bike
// flow, never a hot path.
//
// Normalizes both the incoming registration AND the stored values the
// same way (uppercase, no spaces) before comparing - registrations get
// saved slightly differently depending on which flow created them
// (bike creation trims and uppercases but doesn't strip spaces; the
// plate-lookup flow strips them entirely), so comparing raw strings
// could silently miss a real match.
//
// Checks both originalRegistration and every entry in
// registrationChanges, since a bike that's had a private plate applied
// (or removed) should still be found under whichever plate it's
// carried at any point, not just its very first one.
export async function findBikeByRegistrationAcrossAccounts(
  registration: string
): Promise<{ ownerEmail: string; bikeId: string } | null> {
  const normalized = registration.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;

  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string; pk: string; transferredTo?: unknown }>({
      query:
        "SELECT c.id, c.pk, c.transferredTo FROM c WHERE c.type = 'bike' AND (UPPER(REPLACE(c.originalRegistration, ' ', '')) = @reg OR EXISTS(SELECT VALUE rc FROM rc IN c.registrationChanges WHERE UPPER(REPLACE(rc.plate, ' ', '')) = @reg))",
      parameters: [{ name: "@reg", value: normalized }],
    })
    .fetchAll();

  if (resources.length === 0) return null;

  // A bike that's already been transferred once still has its old,
  // read-only document sitting around sharing the same registration
  // as its successor - prefer whichever match is currently the live
  // head of the chain (no transferredTo set) over a historical one.
  const active = resources.find((r) => !r.transferredTo);
  const match = active ?? resources[0];
  return { ownerEmail: match.pk, bikeId: match.id };
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
  if (countActiveBikes(existing) >= MAX_FREE_BIKES) {
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

export async function updateBikeDvlaData(email: string, bikeId: string, dvlaData: DvlaVehicleData): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return null;
  resource.dvlaData = dvlaData;
  // Auto-fills the existing tankCapacityLitres field (used by
  // tankGuess.ts's full-tank heuristic) with the bike's real capacity,
  // but only if nothing's there yet - never overwrites a value an owner
  // may have already entered themselves.
  if (dvlaData.fuelTankCapacityLitres && !resource.tankCapacityLitres) {
    resource.tankCapacityLitres = dvlaData.fuelTankCapacityLitres;
  }
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

export async function updateBikeStoryCache(email: string, bikeId: string, storyCache: BikeDoc["storyCache"]): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return null;
  resource.storyCache = storyCache;
  await container.items.upsert(resource);
  return resource;
}

export async function updateBikeBuyerOpinionCache(email: string, bikeId: string, buyerOpinionCache: BikeDoc["buyerOpinionCache"]): Promise<BikeDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(bikeId, email).read<BikeDoc>();
  if (!resource) return null;
  resource.buyerOpinionCache = buyerOpinionCache;
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

  // Every record type queried and deleted in parallel, not sequentially
  // one type then the next then the next - each type's query and delete
  // pass is fully independent of the others, so there's no reason to
  // wait for service records to finish before starting on fuel logs.
  // Within each type, every matching record is also deleted in parallel
  // rather than one network round-trip at a time - for an account with
  // real history (hundreds of fuel logs, say), sequential deletes here
  // could genuinely take long enough to risk a request timeout; this
  // does the same work in a fraction of the wall-clock time.
  const recordTypes = ["serviceRecord", "fuelLog", "mod", "bill", "reminder"];
  await Promise.all(
    recordTypes.map(async (type) => {
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
      await Promise.all(resources.map((r) => container.item(r.id, email).delete()));
    })
  );

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
