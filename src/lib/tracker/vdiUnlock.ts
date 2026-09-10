// Place at: src/lib/tracker/vdiUnlock.ts
//
// Vehicle-neutral types shared by the bike and car report-unlock flows -
// VDG's VDICheck/ValuationDetails packages are the same shape regardless
// of vehicle kind (confirmed from a real sample response), so unlike most
// bike/car pairs in this app, there is genuinely nothing to mirror
// separately here. Consumed via type-only imports from shareLink.ts/
// carShareLink.ts, same as every other type-only cross-vehicle import in
// this codebase.
export type VehicleKind = "bike" | "car";

export interface VdiFinanceRecord {
  agreementDate: string | null;
  agreementType: string | null;
  financeCompany: string | null;
}

export interface VdiCheckResult {
  isStolen: boolean;
  hasWriteOffRecord: boolean;
  writeOffRecordCount: number;
  hasOutstandingFinance: boolean;
  financeRecords: VdiFinanceRecord[];
  keeperChangeCount: number;
  plateChangeCount: number;
  colourChangeCount: number;
  currentColour: string | null;
  // VED figures - most relevant for cars, but harmless/omitted-if-absent
  // for bikes, so kept on the one shared shape rather than a car-only field.
  vedFirstYearTwelveMonths: number | null;
  vedStandardTwelveMonths: number | null;
}

export interface ValuationResult {
  valuationTime: string | null;
  valuationMileage: number | null;
  vehicleDescription: string | null;
  onTheRoad: number | null;
  dealerForecourt: number | null;
  tradeRetail: number | null;
  privateClean: number | null;
  privateAverage: number | null;
  partExchange: number | null;
  auction: number | null;
  tradeAverage: number | null;
  tradePoor: number | null;
}

export interface VdiSummaryResult {
  keyFindings: string[];
  // Only ever populated for cars (compares the seller's own asking price,
  // when set, against the valuation figures) - null for bikes, and null
  // for cars whose seller never set an asking price.
  valuationNote: string | null;
  summary: string;
}

export interface VdiUnlock {
  unlockedAt: string;
  stripeSessionId: string;
  amountPaidPence: number;
  currency: string;
  // Filled lazily on first render after unlock, then cached forever -
  // this was paid for once, so VDG/Gemini are never re-billed for
  // repeat views of an already-paid report.
  vdiCheck?: VdiCheckResult;
  valuation?: ValuationResult; // car share links only
  // undefined = not generated yet, null = generation attempted and
  // failed/omitted, populated = a real cached summary.
  aiSummary?: VdiSummaryResult | null;
}
