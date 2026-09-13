// Place at: src/lib/tracker/carFineTypes.ts
//
// Car mirror of fineTypes.ts. Not a spread of FINE_LABELS plus extras -
// the two lists diverge in both directions: "no-seatbelt" and the four
// unpaid-charge penalties (congestion/ULEZ/CAZ/Dart Charge - see
// tollTypes.ts's own comment for why those underlying charges are
// car-only) are real for a car but not a motorcycle, while "no-helmet"
// is real for a motorcycle but not a car. Kept as an independent literal
// rather than a spread merge so neither list silently inherits an entry
// that doesn't apply to it.
export const CAR_FINE_LABELS: Record<string, string> = {
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
