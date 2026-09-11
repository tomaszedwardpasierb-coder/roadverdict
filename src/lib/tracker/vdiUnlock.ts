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

  // The individual mileage readings VDG's own mileage-consistency check
  // is derived from (each one a real reading recorded against this
  // vehicle over time, e.g. from an MOT test) - distinct from, and more
  // granular than, calculatedAverageAnnualMileage/averageMileageForAge
  // above (which are just the two summary figures that check produces).
  // Sorted oldest-first. Reserved for a chart, not shown as a plain list.
  mileageReadings?: VdiMileageReading[];

  // Optional, additive - added for the car Buying Guide's EV-specific
  // report (confirmed against a real Audi e-tron VDICheck sample, same
  // discipline as every other field on this type). driveType/torqueLbFt/
  // powerKw/powerRpm/manufacturerCo2/ncap* below apply to any vehicle,
  // not just EVs - this sample simply happened to be the one that
  // revealed them (the earlier BMW sample this type was first built
  // against didn't include them, but the field paths are confirmed to
  // exist on ModelDetails/ModelDetails.Emissions/ModelDetails.Safety
  // regardless of powertrain type).

  // From Powertrain.PowertrainType directly (e.g. "BEV", "ICE", "PHEV") -
  // not EvDetails.TechnicalDetails' own copy of the same value, which is
  // identical but only ever present when this already says something
  // electric.
  powertrainType?: string | null;

  // Alongside the existing drivingAxle above - DriveType ("4x4") answers
  // "is this AWD/4WD/2WD", DrivingAxle answers "how is that actually
  // applied" (e.g. "All Permanent" vs on-demand) - genuinely two
  // different facts, not a duplicate pair.
  driveType?: string | null;
  // The manufacturer's own declared CO2 figure, alongside the existing
  // dvlaCo2/dvlaCo2Band above (DVLA's own registered figure for tax
  // purposes) - usually close but not guaranteed identical, so kept as
  // its own field rather than merged.
  manufacturerCo2?: number | null;
  // Alongside the existing torqueNm above.
  torqueLbFt?: number | null;
  // Alongside the existing bhp/ps above - this is the model's combined
  // system output where relevant (an EV's own per-motor powerKw figures
  // on VdiMotorDetail below are a different, narrower thing).
  powerKw?: number | null;
  powerRpm?: number | null;

  // Euro NCAP - a vehicle-neutral safety rating, not EV-specific, just
  // never previously captured. Absent entirely (not merely null) when a
  // model has no rating on record - see ncapStarRating's own null check
  // at every call site.
  ncapStarRating?: number | null;
  ncapChildPercent?: number | null;
  ncapAdultPercent?: number | null;
  ncapPedestrianPercent?: number | null;
  ncapSafetyAssistPercent?: number | null;

  // Whether this specific vehicle can rapid-charge at a Tesla
  // Supercharger - distinct from (and not implied by) which physical
  // port types it has, since a CCS port alone doesn't guarantee this.
  isTeslaSuperchargerCompatible?: boolean;
  // One entry per physical charge port this vehicle has (most EVs have
  // just one; this Audi e-tron sample has three, including two Type 2
  // ports on different sides) - never merged into a single figure, since
  // each port has its own max power and charge-time curve.
  chargePorts?: VdiChargePort[];
  // One entry per battery pack - almost always a single entry, but kept
  // as a list since the schema itself is a list (VDG's own modelling
  // choice, not guessed).
  batteries?: VdiBatteryDetail[];
  // One entry per drive motor (a single-motor EV has one, a dual-motor
  // AWD EV like this sample has two - front + rear). The Buying Guide
  // form deliberately only shows the full detail for the first motor and
  // just the differing fields for any others, per the user's own
  // request - that's a display-layer decision, not enforced here.
  motors?: VdiMotorDetail[];
  // EvDetails.TechnicalDetails.TransmissionDetailsList - only ever worth
  // showing separately from the existing transmissionType/numberOfGears
  // above when it actually differs (e.g. per-axle gearing) or has more
  // than one entry; a single entry matching the top-level figures is a
  // pure duplicate, suppressed at display time.
  evTransmissions?: VdiEvTransmission[];

  evMaxChargeInputPowerKw?: number | null;
  evWhPerMile?: number | null;
  evRealRangeMiles?: number | null;
  evRealRangeKm?: number | null;
  evMilesPerChargeHour?: number | null;
  evZeroEmissionMiles?: number | null;
  // One entry per test standard the range was measured under (WLTP,
  // sometimes also EPA/NEDC) - a list because the schema itself is one,
  // even though most vehicles only ever have a single WLTP entry.
  evRangeTestCycles?: VdiRangeTestCycle[];

  // Optional, additive - confirmed against a real Royal Enfield
  // Interceptor INT 650 VDICheck sample, and cross-checked back against
  // the earlier BMW/Audi car samples (both present, sometimes populated
  // there too - genuinely vehicle-neutral, not motorcycle-only).

  // The manufacturer's own precise engine displacement, alongside DVLA's
  // separately-registered (often rounded) figure below - the two can
  // genuinely differ by a few cc, same reasoning as dvlaCo2/
  // manufacturerCo2 being kept as two distinct fields.
  engineCapacityCc?: number | null;
  dvlaEngineCapacityCc?: number | null;
  numberOfSeats?: number | null;
  // DVLA's own registered power-to-weight figure (kW per kg) - a
  // headline spec for a motorcycle in particular, but present in the
  // schema for any vehicle kind.
  powerToWeightRatio?: number | null;
  // This exact model/generation's production run - not this specific
  // vehicle's own dates (see dateFirstRegisteredInUk/dateOfManufacture
  // above for that).
  modelStartDate?: string | null;
  modelEndDate?: string | null;
  // e.g. "L3" (motorcycle >125cc) or "M1" (car) - a real DVLA/type-
  // approval classification, distinct from taxationClass above.
  typeApprovalCategory?: string | null;
  heightMm?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  wheelbaseLengthMm?: number | null;
  // Alongside the existing kerbWeightKg above - unladen excludes fluids/
  // driver, kerb includes them, a genuinely different figure.
  unladenWeightKg?: number | null;
}

export interface VdiMileageReading {
  date: string;
  mileage: number;
  // False when this reading is LOWER than an earlier one - a genuine,
  // specific red flag (the odometer appears to have gone backward), not
  // just noise to filter out silently.
  inSequence: boolean;
  dataSource: string | null;
}

export interface VdiChargeTime {
  chargePortKw: number;
  // Null entries (a charge rate this specific port can't actually reach)
  // are filtered out during parsing - see vdiCheckFetch.ts - so every
  // entry that survives onto this array is a real, displayable figure.
  timeInMinutes: number;
}

export interface VdiChargePort {
  portType: string | null;
  locationOnVehicle: string | null;
  maxChargePowerKw: number | null;
  isStandardChargePort: boolean;
  chargeTimes: VdiChargeTime[];
}

export interface VdiBatteryDetail {
  locationOnVehicle: string | null;
  totalCapacityKwh: number | null;
  usableCapacityKwh: number | null;
  chemistry: string | null;
  // This pack's own warranty - see the VdiCheckResult comment on why
  // this is deliberately not merged with manufacturerWarrantyMonths/
  // manufacturerWarrantyMiles above (the whole-vehicle warranty).
  warrantyMonths: number | null;
  warrantyMiles: number | null;
}

export interface VdiMotorDetail {
  motorType: string | null;
  manufacturer: string | null;
  model: string | null;
  motorLocation: string | null;
  powerKw: number | null;
  maxTorqueNm: number | null;
  axleDrivenByMotor: string | null;
  supportsRegenerativeBraking: boolean;
  additionalInformation: string | null;
}

export interface VdiEvTransmission {
  transmissionType: string | null;
  numberOfGears: number | null;
}

export interface VdiRangeTestCycle {
  testType: string | null;
  combinedRangeMiles: number | null;
  combinedRangeKm: number | null;
  cityRangeMiles: number | null;
  cityRangeKm: number | null;
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
