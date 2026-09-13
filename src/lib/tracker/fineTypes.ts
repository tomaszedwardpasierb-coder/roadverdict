// Place at: src/lib/tracker/fineTypes.ts
//
// Flat key/label catalog, same shape as BILL_LABELS/MOD_LABELS - no
// grouping needed at this size (~20 entries). Covers the fixed-penalty
// and prosecutable offences a private motorist actually logs against a
// specific vehicle, not the full Road Traffic Act.
//
// Motorcycle-specific: no seatbelt fine (motorcycles don't have
// seatbelts to begin with) or a penalty for an unpaid charge that
// doesn't apply to bikes in the first place (congestion/ULEZ/CAZ/Dart
// Charge - see tollTypes.ts's own comment for why those five are
// car-only). "no-helmet" replaces "no-seatbelt" as the genuine
// motorcycle equivalent - a real, common offence with no car analogue.
// carFineTypes.ts carries the full car set (including no-seatbelt and
// the four unpaid-charge penalties above), not a superset of this file -
// the two lists diverge in both directions, not just car-adds-on-top,
// so they're kept as independent literals rather than a spread merge.
export const FINE_LABELS: Record<string, string> = {
  speeding: "Speeding (fixed penalty / NIP)",
  "mobile-phone": "Using a mobile phone while driving",
  "no-helmet": "Riding without a helmet (rider or passenger)",
  "red-light": "Failing to stop at a red light",
  "bus-lane": "Bus lane violation",
  "yellow-box": "Yellow box junction violation",
  "careless-driving": "Careless driving",
  "driving-without-due-care": "Driving without due care and attention",
  "no-insurance": "Driving without insurance",
  "no-mot": "Driving without a valid MOT",
  "no-vehicle-tax": "Driving without vehicle tax (SORN/VED)",
  "parking-pcn": "Parking Charge Notice (PCN)",
  "dangerous-condition": "Using a vehicle in a dangerous condition",
  overloading: "Overloading a vehicle",
  "drink-drug-driving": "Drink or drug driving",
  other: "Other fine",
};
