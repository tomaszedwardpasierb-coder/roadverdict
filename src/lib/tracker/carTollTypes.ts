// Place at: src/lib/tracker/carTollTypes.ts
//
// Car mirror of tollTypes.ts. Not a spread of TOLL_LABELS plus extras -
// see that file's own comment: five entries here (Dartford Crossing,
// London Congestion Charge, ULEZ, and the UK Clean Air Zones) genuinely
// don't exist as a chargeable event for a motorcycle at all, the same
// real-world fact carBillTypes.ts's CAR_ONLY_BILL_LABELS already
// documents for the equivalent bill-side charges. Everything else
// (the regional bridges/tunnels, parking, other) is identical to the
// motorcycle list, since those genuinely still charge motorcycles too.
export const CAR_TOLL_LABELS: Record<string, string> = {
  "dartford-crossing": "Dartford Crossing (Dart Charge)",
  "m6-toll": "M6 Toll",
  "mersey-gateway": "Mersey Gateway Bridge",
  "tyne-tunnel": "Tyne Tunnel",
  "humber-bridge": "Humber Bridge",
  "clifton-suspension-bridge": "Clifton Suspension Bridge (Bristol)",
  "itchen-bridge": "Itchen Bridge (Southampton)",
  "london-congestion-charge": "London Congestion Charge",
  ulez: "Ultra Low Emission Zone (ULEZ) charge",
  "caz-birmingham": "Birmingham Clean Air Zone",
  "caz-bristol": "Bristol Clean Air Zone",
  "caz-portsmouth": "Portsmouth Clean Air Zone",
  "caz-bath": "Bath Clean Air Zone",
  "caz-sheffield": "Sheffield Clean Air Zone",
  parking: "Parking",
  other: "Other toll/charge",
};
