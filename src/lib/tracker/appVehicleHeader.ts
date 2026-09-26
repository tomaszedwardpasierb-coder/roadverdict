// Place at: src/lib/tracker/appVehicleHeader.ts
//
// Every tracker write route acts on "the active bike/car", which the
// website decides with its activeBikeId/activeCarId cookies (see
// pickActiveBike/pickActiveCar). The Android app has no cookie jar, so
// it names the vehicle it means in one of these headers instead - read
// only when the cookie is absent, so nothing about how the website picks
// its vehicle changes. The id is only ever matched against the signed-in
// account's own list, so it can't reach anyone else's vehicle.
import { headers } from "next/headers";

export const APP_BIKE_HEADER = "x-rv-bike-id";
export const APP_CAR_HEADER = "x-rv-car-id";

export async function readAppVehicleHeader(name: typeof APP_BIKE_HEADER | typeof APP_CAR_HEADER): Promise<string | null> {
  try {
    return (await headers()).get(name);
  } catch {
    // No request in scope (or a test double without headers()) - the
    // same as a request that didn't send one.
    return null;
  }
}
