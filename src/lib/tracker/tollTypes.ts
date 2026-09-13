// Place at: src/lib/tracker/tollTypes.ts
//
// Flat key/label catalog, same shape as FINE_LABELS/BILL_LABELS. These
// are the charge itself for using a crossing/road/zone - not a penalty
// for failing to pay one (those live in fineTypes.ts as e.g.
// "dart-charge-penalty"/"ulez-penalty").
export const TOLL_LABELS: Record<string, string> = {
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
  other: "Other toll/charge",
};
