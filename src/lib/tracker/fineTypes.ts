// Place at: src/lib/tracker/fineTypes.ts
//
// Flat key/label catalog, same shape as BILL_LABELS/MOD_LABELS - no
// grouping needed at this size (~20 entries). Covers the fixed-penalty
// and prosecutable offences a private motorist actually logs against a
// specific vehicle, not the full Road Traffic Act.
export const FINE_LABELS: Record<string, string> = {
  speeding: "Speeding (fixed penalty / NIP)",
  "mobile-phone": "Using a mobile phone while driving",
  "no-seatbelt": "Not wearing a seatbelt",
  "red-light": "Failing to stop at a red light",
  "bus-lane": "Bus lane violation",
  "yellow-box": "Yellow box junction violation",
  "careless-driving": "Careless driving",
  "driving-without-due-care": "Driving without due care and attention",
  "no-insurance": "Driving without insurance",
  "no-mot": "Driving without a valid MOT",
  "no-vehicle-tax": "Driving without vehicle tax (SORN/VED)",
  "parking-pcn": "Parking Charge Notice (PCN)",
  "congestion-charge-penalty": "Congestion Charge penalty (unpaid)",
  "ulez-penalty": "ULEZ penalty charge (unpaid)",
  "caz-penalty": "Clean Air Zone penalty charge (unpaid)",
  "dart-charge-penalty": "Dart Charge penalty (unpaid)",
  "dangerous-condition": "Using a vehicle in a dangerous condition",
  overloading: "Overloading a vehicle",
  "drink-drug-driving": "Drink or drug driving",
  other: "Other fine",
};
