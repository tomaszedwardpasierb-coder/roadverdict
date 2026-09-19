// Place at: src/lib/tracker/activeVehicle.ts
//
// The hybrid dashboard's own resolution layer (see RoadVerdict_Car_Plan_v3.md's
// ADR) - deliberately a third, neutral file rather than living inside
// bike.ts or car.ts, since either choice would create exactly the
// runtime coupling between the two sister schemas this build has
// avoided everywhere else. ACTIVE_BIKE_COOKIE and ACTIVE_CAR_COOKIE
// each already track "which bike/car of that kind is active" - this
// adds the one missing piece, "which KIND is active right now", since
// a single shared /dashboard needs a durable answer to that on every
// server render, and neither existing cookie can supply it on its own
// (an account can hold both a bike and a car at once).
import { cookies } from "next/headers";
import { getBikesForUser, pickActiveBike, isBikeReadOnly, type BikeDoc } from "./bike";
import { getCarsForUser, pickActiveCar, isCarReadOnly, type CarDoc } from "./car";

export type VehicleKind = "bike" | "car";
export const ACTIVE_VEHICLE_KIND_COOKIE = "activeVehicleKind";

// "Active" here means something different from resolveActiveVehicle
// below - that function resolves the ONE vehicle currently selected in
// the garage switcher (cookie-driven UI state). This one resolves EVERY
// vehicle the account still actively owns/manages - the same "not
// transferred away" sense vehicleLimit.ts already counts by - for
// features (the assistant's cross-vehicle spend tools) that need to see
// the whole account, not just whatever happens to be selected right now.

export type ResolvedActiveVehicle =
  | { kind: "bike"; bike: BikeDoc; hasAnyCar: boolean }
  | { kind: "car"; car: CarDoc; hasAnyBike: boolean };

// Bike is the default when no preference is recorded yet - every
// account that predates car support has bikes and no opinion on this
// cookie, and must land exactly where it always has. A preference for
// a kind the account no longer holds (e.g. its only car was deleted)
// falls back the same way, rather than resolving to nothing.
//
// preFetched is optional and purely an optimisation: a caller that's
// already fetched both lists for its own purposes (dashboard/page.tsx
// needs the full bikes+cars lists regardless of which one ends up
// active) can pass them in to skip this function's own internal fetch,
// rather than paying for the same bikes+cars round-trip twice on one
// page load. Every existing caller that doesn't pass it keeps working
// unchanged.
export async function resolveActiveVehicle(
  email: string,
  preFetched?: { bikes: BikeDoc[]; cars: CarDoc[] }
): Promise<ResolvedActiveVehicle | null> {
  const [bikes, cars] = preFetched
    ? [preFetched.bikes, preFetched.cars]
    : await Promise.all([getBikesForUser(email), getCarsForUser(email)]);
  if (bikes.length === 0 && cars.length === 0) return null;

  const cookieStore = await cookies();
  const preferredKind = cookieStore.get(ACTIVE_VEHICLE_KIND_COOKIE)?.value;

  if (preferredKind === "car" && cars.length > 0) {
    const car = await pickActiveCar(cars);
    if (car) return { kind: "car", car, hasAnyBike: bikes.length > 0 };
  }
  if (bikes.length > 0) {
    const bike = await pickActiveBike(bikes);
    if (bike) return { kind: "bike", bike, hasAnyCar: cars.length > 0 };
  }
  if (cars.length > 0) {
    const car = await pickActiveCar(cars);
    if (car) return { kind: "car", car, hasAnyBike: false };
  }
  return null;
}

export type ResolvedVehicleRef =
  | { kind: "bike"; bike: BikeDoc }
  | { kind: "car"; car: CarDoc };

// Every actively-owned vehicle on the account, bike and car alike,
// transferred-away ones excluded - see the comment above on why this is
// a genuinely different "active" from resolveActiveVehicle's own.
export async function resolveAllActiveVehicles(email: string): Promise<ResolvedVehicleRef[]> {
  const [bikes, cars] = await Promise.all([getBikesForUser(email), getCarsForUser(email)]);
  return [
    ...bikes.filter((b) => !isBikeReadOnly(b)).map((bike) => ({ kind: "bike" as const, bike })),
    ...cars.filter((c) => !isCarReadOnly(c)).map((car) => ({ kind: "car" as const, car })),
  ];
}
