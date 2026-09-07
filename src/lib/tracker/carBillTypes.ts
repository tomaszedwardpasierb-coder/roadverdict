// Place at: src/lib/tracker/carBillTypes.ts
//
// Cars reuse the four existing bill keys (insurance, road-tax, mot-test,
// finance) via import, not re-declaration, so there's exactly one
// canonical source for each - billTypes.ts itself is not modified. Two
// car-only additions on top: ULEZ/Clean Air Zone and Congestion Charge,
// real recurring costs most motorcycles are exempt from in most UK
// schemes, that have no motorcycle equivalent at all.
import { BILL_LABELS } from "./billTypes";

export const CAR_ONLY_BILL_LABELS: Record<string, string> = {
  "ulez-caz": "ULEZ / Clean Air Zone charge",
  "congestion": "Congestion Charge",
};

export const CAR_BILL_LABELS: Record<string, string> = { ...BILL_LABELS, ...CAR_ONLY_BILL_LABELS };
