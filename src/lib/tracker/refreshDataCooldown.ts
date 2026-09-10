// Place at: src/lib/tracker/refreshDataCooldown.ts
//
// The "Refresh vehicle data" button's cooldown - identical for bikes and
// cars, so kept as its own tiny, zero-dependency constant (same reasoning
// as vehicleLimit.ts's MAX_FREE_VEHICLES) rather than duplicated as a
// magic number inside both bike.ts and car.ts.
export const REFRESH_DATA_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000;
