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
import { getBikesForUser, pickActiveBike, type BikeDoc } from "./bike";
import { getCarsForUser, pickActiveCar, type CarDoc } from "./car";

export type VehicleKind = "bike" | "car";
export const ACTIVE_VEHICLE_KIND_COOKIE = "activeVehicleKind";

export type ResolvedActiveVehicle =
  | { kind: "bike"; bike: BikeDoc; hasAnyCar: boolean }
  | { kind: "car"; car: CarDoc; hasAnyBike: boolean };

// Bike is the default when no preference is recorded yet - every
// account that predates car support has bikes and no opinion on this
// cookie, and must land exactly where it always has. A preference for
// a kind the account no longer holds (e.g. its only car was deleted)
// falls back the same way, rather than resolving to nothing.
export async function resolveActiveVehicle(email: string): Promise<ResolvedActiveVehicle | null> {
  const [bikes, cars] = await Promise.all([getBikesForUser(email), getCarsForUser(email)]);
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
