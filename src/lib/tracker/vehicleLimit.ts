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
