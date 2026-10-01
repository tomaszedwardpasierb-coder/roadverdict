// Place at: src/lib/tracker/vehicleLimit.ts
//
// The combined bike+car free-tier cap. Deliberately its own tiny,
// zero-dependency file rather than living inside bike.ts or car.ts -
// enforcing ONE cap across both kinds needs to count both, which
// neither of those files can do on its own without importing the
// other's runtime code (the sister-schema rule this app keeps
// everywhere else). The two POST route handlers (bike and car
// creation) are the layer that's already allowed to cross both domains
// - see their own pre-check blocks - so this file only needs to export
// the shared number, not any counting logic itself.
export const MAX_FREE_VEHICLES = 1;

// Pro's own combined bike+car cap - previously unenforced entirely
// (Pro accounts could add unlimited vehicles), even though Pro's own
// marketing copy (PRO_FEATURES in subscriptions.ts) already promises
// specifically "a second vehicle," never "unlimited vehicles." Every
// vehicle adds real, recurring VDG cost (refresh-data alone is three
// paid calls every 5 days per vehicle) with no ceiling of its own, so
// leaving Pro uncapped multiplied that cost with nothing to stop it.
export const MAX_PRO_VEHICLES = 2;

// The most any one account can ever track, however it got there - an
// admin-set allowance (UserDoc.vehicleAllowance, set from /tomasz for
// an owner who pays for extra vehicles) can lift an account up to this,
// never past it.
export const MAX_GRANTED_VEHICLES = 4;

// Extra vehicles a Pro subscriber can buy on top of Pro's own cap
// (£1.99/month each - see src/lib/payments/extraVehicles.ts).
export const MAX_EXTRA_VEHICLES = MAX_GRANTED_VEHICLES - MAX_PRO_VEHICLES;

// The one rule for "how many vehicles may this account track": its
// plan's own cap plus any extra vehicles it pays for (which only count
// while it's Pro), raised (never lowered) by an admin allowance, and
// never above MAX_GRANTED_VEHICLES.
export function vehicleLimitFor(isPro: boolean, allowance?: number | null, extraVehicles = 0): number {
  const planLimit = isPro ? MAX_PRO_VEHICLES + wholeOrZero(extraVehicles) : MAX_FREE_VEHICLES;
  return Math.min(MAX_GRANTED_VEHICLES, Math.max(planLimit, wholeOrZero(allowance)));
}

function wholeOrZero(n: number | null | undefined): number {
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
}
