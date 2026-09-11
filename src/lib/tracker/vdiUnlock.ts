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
  // DVLA's own running count at the time of this change, not something
  // derived from the length of this array - the two can differ (e.g. a
  // keeper change from before this vehicle's VDG history began).
  numberOfPreviousKeepers?: number | null;
}

export interface VdiWriteOffRecord {
  // e.g. "CAT N NON STRUCTURAL DAMAGE" - already human-readable from VDG,
  // not something to reconstruct from category + description ourselves.
  status: string | null;
  category: string | null;
  lossDate: string | null;
  insurerName: string | null;
  insurerCode: string | null;
}

export interface VdiPlateChange {
  currentVrm: string | null;
  previousVrm: string | null;
  dateOfTransaction: string | null;
}

export interface VdiSoundLevels {
  stationaryDb: number | null;
  driveByDb: number | null;
  // The engine speed the drive-by figure was measured at, not the
  // stationary test's own (different) rev point - VDG gives one shared
  // EngineSpeedRpm value for the pair.
  engineSpeedRpm: number | null;
}

// Whether this vehicle has ever been recorded on the Police National
// Computer - distinct from (and additional to) the plain isStolen flag
// below, which only ever answers "currently marked stolen right now".
// All null when nothing's on record, same as a clean MIAFTR/finance check.
export interface VdiPncDetail {
  policeForceName: string | null;
  currentStatusOnRecord: string | null;
  dateReportedStolen: string | null;
  dateRecordAddedToPnc: string | null;
}

// A full-quality figure alongside the more commonly quoted MPG one -
// litres/100km reads naturally for anyone used to metric fuel figures,
// rather than forcing a conversion in the reader's head.
export interface VdiFuelEconomy {
  urbanColdMpg: number | null;
  extraUrbanMpg: number | null;
  combinedMpg: number | null;
  urbanColdL100Km: number | null;
  extraUrbanL100Km: number | null;
  combinedL100Km: number | null;
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
  // Optional, additive - added after the original VDICheck fetch/type
  // were first built, so an already-cached vdiUnlock.vdiCheck from a
  // check paid for before this change simply won't have these (a fresh
  // fetch always populates every one of them, never leaving them
  // undefined - see vdiCheckFetch.ts).
  writeOffRecords?: VdiWriteOffRecord[];
  plateChanges?: VdiPlateChange[];
  originalColour?: string | null;
  dateFirstRegisteredInUk?: string | null;
  dateOfManufacture?: string | null;
  // The standard rate's 6-month VED option, alongside the existing
  // 12-month figures above (vedFirstYearTwelveMonths/vedStandardTwelveMonths).
  vedStandardSixMonths?: number | null;
  massInServiceKg?: number | null;
  taxationClass?: string | null;
  bhp?: number | null;
  soundLevels?: VdiSoundLevels | null;

  // Optional, additive - added for the car Buying Guide's fuller
  // technical-spec report (confirmed against a real BMW 640i VDICheck
  // sample, same discipline as every other field on this type). Left on
  // the one shared type rather than split into a car-only variant, same
  // reasoning as vedFirstYearTwelveMonths above - harmless when a bike
  // check doesn't populate one of these.

  // Identity / model detail
  series?: string | null;
  platformName?: string | null;
  countryOfOrigin?: string | null;
  // DVLA's own fuel-type string - the canonical source when it and
  // ModelDetails' own Powertrain.FuelType would otherwise show as two
  // near-duplicate rows for the same fact.
  dvlaFuelType?: string | null;
  bodyStyle?: string | null;
  dvlaBodyType?: string | null;
  dvlaWheelPlan?: string | null;

  // Status flags
  isImported?: boolean;
  isImportedFromOutsideEu?: boolean;
  isScrapped?: boolean;
  certificateOfDestructionIssued?: boolean;

  // Emissions / tax
  euroStatus?: string | null;
  dvlaCo2?: number | null;
  dvlaCo2Band?: string | null;

  // Weights
  kerbWeightKg?: number | null;
  grossCombinedWeightKg?: number | null;

  // Engine / transmission
  cylinderArrangement?: string | null;
  numberOfCylinders?: number | null;
  aspiration?: string | null;
  transmissionType?: string | null;
  numberOfGears?: number | null;
  drivingAxle?: string | null;
  fuelTankCapacityLitres?: number | null;

  // Performance - alongside the existing bhp field above
  ps?: number | null;
  torqueNm?: number | null;
  torqueRpm?: number | null;
  zeroToSixtyMph?: number | null;
  zeroToOneHundredKph?: number | null;
  maxSpeedMph?: number | null;
  maxSpeedKph?: number | null;
  fuelEconomy?: VdiFuelEconomy | null;

  // Colour - alongside the existing originalColour/currentColour above.
  // Only meaningful (and only ever shown) when colourChangeCount > 0.
  previousColour?: string | null;

  // Police National Computer detail
  pncDetail?: VdiPncDetail | null;
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
