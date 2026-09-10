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

export interface VdiKeeperChange {
  keeperStartDate: string;
  previousKeeperDisposalDate: string | null;
}

export interface VdiCheckResult {
  isStolen: boolean;
  hasWriteOffRecord: boolean;
  writeOffRecordCount: number;
  hasOutstandingFinance: boolean;
  financeRecords: VdiFinanceRecord[];
  // Dates, not just a count - lets the AI summary reason about ownership
  // turnover velocity (several changes within a year is a real, specific
  // pattern worth naming), not just report a bare number.
  keeperChanges: VdiKeeperChange[];
  keeperChangeCount: number;
  plateChangeCount: number;
  colourChangeCount: number;
  currentColour: string | null;
  // VED figures - most relevant for cars, but harmless/omitted-if-absent
  // for bikes, so kept on the one shared shape rather than a car-only field.
  vedFirstYearTwelveMonths: number | null;
  vedStandardTwelveMonths: number | null;
  // How many times the V5C logbook has been reissued - corroborates
  // keeper-change velocity (a reissue accompanies most ownership changes).
  v5cReissueCount: number;
  // Independent, DVSA-derived mileage-consistency check - genuinely
  // different from this app's own mileageCheck.ts (which only checks the
  // owner's own logged entries against each other): this compares the
  // vehicle's real calculated annual mileage against what's typical for
  // its age.
  calculatedAverageAnnualMileage: number | null;
  averageMileageForAge: number | null;
  mileageAnomalyDetected: boolean;
  manufacturerWarrantyMiles: number | null;
  manufacturerWarrantyMonths: number | null;
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
