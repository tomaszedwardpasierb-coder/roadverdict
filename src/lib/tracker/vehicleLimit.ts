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
