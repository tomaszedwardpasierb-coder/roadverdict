// Place at: src/lib/tracker/vehicleTypeCheck.ts
//
// Extracted out of plate-lookup/route.ts so buying-guide-lookup/route.ts
// can reuse the exact same classification rather than duplicating it or
// drifting into a second, slightly different version over time. Both
// routes' callers (AddBikeForm, QuoteForm, CostCalculatorForm,
// BuyingGuideForm) gate on this identically: 'four-wheeled' and
// 'unknown' both stop the lookup before any auto-fill happens,
// 'motorcycle' is the only result that proceeds.

export type VehicleTypeCheck = 'motorcycle' | 'four-wheeled' | 'unknown';

// Best-informed classification based on general DVLA body-type
// terminology, NOT verified against a live VDG response - this needs
// testing against a real motorcycle registration and a real car
// registration to confirm the actual returned DvlaBodyType strings
// match these assumptions before this is trusted in production. Errs
// toward "unknown" rather than guessing wrong in either direction:
// keyword lists here are deliberately not exhaustive, so anything that
// doesn't clearly match either side falls through to unknown rather
// than being force-classified.
const MOTORCYCLE_BODY_TYPE_KEYWORDS = ['MOTOR CYCLE', 'MOTORCYCLE', 'M/CYCLE', 'MOPED', 'SCOOTER'];
const FOUR_WHEELED_BODY_TYPE_KEYWORDS = [
  'SALOON', 'HATCHBACK', 'ESTATE', 'COUPE', 'CONVERTIBLE', 'MPV', 'SUV',
  '4X4', 'VAN', 'TRUCK', 'MINIBUS', 'PICK-UP', 'PICKUP', 'LIMOUSINE',
];

export function classifyVehicleType(rawBodyType: string): VehicleTypeCheck {
  const normalized = rawBodyType.trim().toUpperCase();
  if (!normalized) return 'unknown';
  if (MOTORCYCLE_BODY_TYPE_KEYWORDS.some((kw) => normalized.includes(kw))) return 'motorcycle';
  if (FOUR_WHEELED_BODY_TYPE_KEYWORDS.some((kw) => normalized.includes(kw))) return 'four-wheeled';
  return 'unknown';
}