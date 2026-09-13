// Place at: src/lib/tracker/tollTypes.ts
//
// Flat key/label catalog, same shape as FINE_LABELS/BILL_LABELS. These
// are the charge itself for using a crossing/road/zone - not a penalty
// for failing to pay one (those live in fineTypes.ts as e.g.
// "dart-charge-penalty"/"ulez-penalty").
//
// Motorcycle-specific: Dartford Crossing, London Congestion Charge, ULEZ,
// and every UK Clean Air Zone genuinely exempt motorcycles outright - not
// "cheaper for bikes," not chargeable, at all - same real-world fact
// carBillTypes.ts's own CAR_ONLY_BILL_LABELS comment already documents
// for the equivalent bill-side charges ("real recurring costs most
// motorcycles are exempt from... that have no motorcycle equivalent at
// all"). Those five entries live only in carTollTypes.ts's
// CAR_ONLY_TOLL_LABELS, not here - showing them to a motorcyclist would
// offer a charge they can never actually be billed for. The remaining
// bridges/tunnels below (M6, Mersey Gateway, Tyne Tunnel, Humber, Clifton
// Suspension, Itchen) genuinely do still charge motorcycles (typically at
// a lower banded rate, not free), so those stay for both vehicle kinds
// rather than being guessed away.
export const TOLL_LABELS: Record<string, string> = {
  "m6-toll": "M6 Toll",
  "mersey-gateway": "Mersey Gateway Bridge",
  "tyne-tunnel": "Tyne Tunnel",
  "humber-bridge": "Humber Bridge",
  "clifton-suspension-bridge": "Clifton Suspension Bridge (Bristol)",
  "itchen-bridge": "Itchen Bridge (Southampton)",
  parking: "Parking",
  other: "Other toll/charge",
};
