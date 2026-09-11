// Place at: src/lib/tracker/vdiCheckFetch.ts
//
// The VDICheck VDG package call, kept separate from vdiUnlock.ts (that
// file is deliberately pure types, no fetch) - same split as
// motHistory.ts/motHistoryFetch.ts. Shared by the report-unlock flow and
// the Buying Guide's paid VDI check (both bike and car - VDICheck's
// shape is identical regardless of vehicle kind, confirmed from a real
// sample response), rather than duplicating this VDG call four times.
//
// Deliberately data-rich: this pulls every field confirmed useful from a
// real sample response (keeper-change dates, V5C reissue count, the
// independent mileage-vs-average-for-age check, manufacturer warranty),
// not just the minimal stolen/write-off/finance flags - a buyer paying
// for this should see the full value of what was actually checked.
import type {
  VdiCheckResult,
  VdiFinanceRecord,
  VdiKeeperChange,
  VdiWriteOffRecord,
  VdiPlateChange,
  VdiSoundLevels,
  VdiPncDetail,
  VdiFuelEconomy,
} from "./vdiUnlock";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

interface RawFinanceRecord {
  AgreementDate?: string;
  AgreementType?: string;
  FinanceCompany?: string;
}

interface RawKeeperChange {
  KeeperStartDate?: string;
  PreviousKeeperDisposalDate?: string | null;
  NumberOfPreviousKeepers?: number | null;
}

interface RawPlateChange {
  CurrentVrm?: string;
  PreviousVrm?: string;
  DateOfTransaction?: string;
}

interface RawWriteOffRecord {
  Status?: string;
  Category?: string;
  LossDate?: string | null;
  InsurerName?: string;
  InsurerCode?: string;
}

// Field paths below are taken directly from a real, verified VDICheck
// response (same standard this codebase's other VDG fetchers hold
// themselves to - see dvlaDataFetch.ts's own comment on why a guessed
// schema isn't trusted here) - the identity/technical-spec block was
// confirmed against a real BMW 640i sample specifically, for the car
// Buying Guide's fuller report.
interface RawVdiCheckResponse {
  ResponseInformation: { IsSuccessStatusCode: boolean };
  Results: {
    VehicleDetails?: {
      VehicleIdentification?: {
        DateFirstRegisteredInUk?: string;
        DateOfManufacture?: string;
        DvlaWheelPlan?: string;
        DvlaBodyType?: string;
        DvlaFuelType?: string;
      };
      VehicleStatus?: {
        IsImported?: boolean;
        IsImportedFromOutsideEu?: boolean;
        IsScrapped?: boolean;
        CertificateOfDestructionIssued?: boolean;
        VehicleExciseDutyDetails?: {
          DvlaCo2?: number | null;
          DvlaCo2Band?: string | null;
          VedRate?: {
            FirstYear?: { TwelveMonths?: number | null };
            Standard?: { TwelveMonths?: number | null; SixMonths?: number | null };
          };
        };
      };
      VehicleHistory?: {
        ColourDetails?: { CurrentColour?: string; OriginalColour?: string; PreviousColour?: string | null; NumberOfColourChanges?: number };
        KeeperChangeList?: RawKeeperChange[];
        PlateChangeList?: RawPlateChange[];
        V5cCertificateList?: unknown[];
      };
      DvlaTechnicalDetails?: {
        MassInServiceKg?: number | null;
      };
    };
    ModelDetails?: {
      ModelIdentification?: {
        Series?: string;
        CountryOfOrigin?: string | null;
      };
      ModelClassification?: { TaxationClass?: string };
      BodyDetails?: {
        PlatformName?: string | null;
        BodyStyle?: string | null;
        FuelTankCapacityLitres?: number | null;
      };
      Weights?: {
        KerbWeightKg?: number | null;
        GrossCombinedWeightKg?: number | null;
      };
      AdditionalInformation?: {
        VehicleWarrantyInformation?: {
          ManufacturerWarrantyMiles?: number | null;
          ManufacturerWarrantyMonths?: number | null;
        };
      };
      Emissions?: {
        EuroStatus?: string | null;
        SoundLevels?: { StationaryDb?: number | null; DriveByDb?: number | null; EngineSpeedRpm?: number | null };
      };
      Powertrain?: {
        IceDetails?: {
          Aspiration?: string | null;
          CylinderArrangement?: string | null;
          NumberOfCylinders?: number | null;
        };
        Transmission?: {
          TransmissionType?: string | null;
          NumberOfGears?: number | null;
          DrivingAxle?: string | null;
        };
      };
      Performance?: {
        Power?: { Bhp?: number | null; Ps?: number | null };
        Torque?: { Nm?: number | null; Rpm?: number | null };
        Statistics?: {
          ZeroToSixtyMph?: number | null;
          ZeroToOneHundredKph?: number | null;
          MaxSpeedMph?: number | null;
          MaxSpeedKph?: number | null;
        };
        FuelEconomy?: {
          UrbanColdMpg?: number | null;
          ExtraUrbanMpg?: number | null;
          CombinedMpg?: number | null;
          UrbanColdL100Km?: number | null;
          ExtraUrbanL100Km?: number | null;
          CombinedL100Km?: number | null;
        };
      };
    };
    PncDetails?: {
      IsStolen?: boolean;
      PoliceForceName?: string | null;
      CurrentStatusOnRecord?: string | null;
      DateReportedStolen?: string | null;
      DateRecordAddedToPnc?: string | null;
    };
    MiaftrDetails?: { WriteOffRecordList?: RawWriteOffRecord[] };
    FinanceDetails?: { FinanceRecordList?: RawFinanceRecord[] };
    MileageCheckDetails?: {
      CalculatedAverageAnnualMileage?: number | null;
      AverageMileageForAge?: number | null;
      MileageAnomalyDetected?: boolean;
    };
  };
}

export async function fetchVdiCheckFromVdg(vrm: string, apiKey: string): Promise<VdiCheckResult | null> {
  try {
    const res = await fetch(`${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=VDICheck&vrm=${encodeURIComponent(vrm)}`);
    const data: RawVdiCheckResponse = await res.json();
    if (!data?.ResponseInformation?.IsSuccessStatusCode) {
      return null;
    }

    const vd = data.Results.VehicleDetails;
    const financeRecords: VdiFinanceRecord[] = (data.Results.FinanceDetails?.FinanceRecordList ?? []).map((r) => ({
      agreementDate: r.AgreementDate ?? null,
      agreementType: r.AgreementType ?? null,
      financeCompany: r.FinanceCompany ?? null,
    }));
    const writeOffRecordList = data.Results.MiaftrDetails?.WriteOffRecordList ?? [];
    const writeOffRecords: VdiWriteOffRecord[] = writeOffRecordList.map((r) => ({
      status: r.Status ?? null,
      category: r.Category ?? null,
      lossDate: r.LossDate ?? null,
      insurerName: r.InsurerName ?? null,
      insurerCode: r.InsurerCode ?? null,
    }));
    const keeperChanges: VdiKeeperChange[] = (vd?.VehicleHistory?.KeeperChangeList ?? []).map((k) => ({
      keeperStartDate: k.KeeperStartDate ?? "",
      previousKeeperDisposalDate: k.PreviousKeeperDisposalDate ?? null,
      numberOfPreviousKeepers: k.NumberOfPreviousKeepers ?? null,
    }));
    const plateChanges: VdiPlateChange[] = (vd?.VehicleHistory?.PlateChangeList ?? []).map((p) => ({
      currentVrm: p.CurrentVrm ?? null,
      previousVrm: p.PreviousVrm ?? null,
      dateOfTransaction: p.DateOfTransaction ?? null,
    }));
    const mileageCheck = data.Results.MileageCheckDetails;
    const warranty = data.Results.ModelDetails?.AdditionalInformation?.VehicleWarrantyInformation;
    const rawSoundLevels = data.Results.ModelDetails?.Emissions?.SoundLevels;
    const soundLevels: VdiSoundLevels | null = rawSoundLevels
      ? {
          stationaryDb: rawSoundLevels.StationaryDb ?? null,
          driveByDb: rawSoundLevels.DriveByDb ?? null,
          engineSpeedRpm: rawSoundLevels.EngineSpeedRpm ?? null,
        }
      : null;

    const modelDetails = data.Results.ModelDetails;
    const rawFuelEconomy = modelDetails?.Performance?.FuelEconomy;
    const fuelEconomy: VdiFuelEconomy | null = rawFuelEconomy
      ? {
          urbanColdMpg: rawFuelEconomy.UrbanColdMpg ?? null,
          extraUrbanMpg: rawFuelEconomy.ExtraUrbanMpg ?? null,
          combinedMpg: rawFuelEconomy.CombinedMpg ?? null,
          urbanColdL100Km: rawFuelEconomy.UrbanColdL100Km ?? null,
          extraUrbanL100Km: rawFuelEconomy.ExtraUrbanL100Km ?? null,
          combinedL100Km: rawFuelEconomy.CombinedL100Km ?? null,
        }
      : null;

    const rawPnc = data.Results.PncDetails;
    const pncDetail: VdiPncDetail | null =
      rawPnc?.PoliceForceName || rawPnc?.CurrentStatusOnRecord || rawPnc?.DateReportedStolen || rawPnc?.DateRecordAddedToPnc
        ? {
            policeForceName: rawPnc?.PoliceForceName ?? null,
            currentStatusOnRecord: rawPnc?.CurrentStatusOnRecord ?? null,
            dateReportedStolen: rawPnc?.DateReportedStolen ?? null,
            dateRecordAddedToPnc: rawPnc?.DateRecordAddedToPnc ?? null,
          }
        : null;

    return {
      isStolen: data.Results.PncDetails?.IsStolen ?? false,
      hasWriteOffRecord: writeOffRecordList.length > 0,
      writeOffRecordCount: writeOffRecordList.length,
      hasOutstandingFinance: financeRecords.length > 0,
      financeRecords,
      keeperChanges,
      keeperChangeCount: keeperChanges.length,
      plateChangeCount: vd?.VehicleHistory?.PlateChangeList?.length ?? 0,
      colourChangeCount: vd?.VehicleHistory?.ColourDetails?.NumberOfColourChanges ?? 0,
      currentColour: vd?.VehicleHistory?.ColourDetails?.CurrentColour ?? null,
      vedFirstYearTwelveMonths: vd?.VehicleStatus?.VehicleExciseDutyDetails?.VedRate?.FirstYear?.TwelveMonths ?? null,
      vedStandardTwelveMonths: vd?.VehicleStatus?.VehicleExciseDutyDetails?.VedRate?.Standard?.TwelveMonths ?? null,
      v5cReissueCount: vd?.VehicleHistory?.V5cCertificateList?.length ?? 0,
      calculatedAverageAnnualMileage: mileageCheck?.CalculatedAverageAnnualMileage ?? null,
      averageMileageForAge: mileageCheck?.AverageMileageForAge ?? null,
      mileageAnomalyDetected: mileageCheck?.MileageAnomalyDetected ?? false,
      manufacturerWarrantyMiles: warranty?.ManufacturerWarrantyMiles ?? null,
      manufacturerWarrantyMonths: warranty?.ManufacturerWarrantyMonths ?? null,
      writeOffRecords,
      plateChanges,
      originalColour: vd?.VehicleHistory?.ColourDetails?.OriginalColour ?? null,
      dateFirstRegisteredInUk: vd?.VehicleIdentification?.DateFirstRegisteredInUk ?? null,
      dateOfManufacture: vd?.VehicleIdentification?.DateOfManufacture ?? null,
      vedStandardSixMonths: vd?.VehicleStatus?.VehicleExciseDutyDetails?.VedRate?.Standard?.SixMonths ?? null,
      massInServiceKg: vd?.DvlaTechnicalDetails?.MassInServiceKg ?? null,
      taxationClass: data.Results.ModelDetails?.ModelClassification?.TaxationClass ?? null,
      bhp: data.Results.ModelDetails?.Performance?.Power?.Bhp ?? null,
      soundLevels,

      series: modelDetails?.ModelIdentification?.Series ?? null,
      platformName: modelDetails?.BodyDetails?.PlatformName ?? null,
      countryOfOrigin: modelDetails?.ModelIdentification?.CountryOfOrigin ?? null,
      dvlaFuelType: vd?.VehicleIdentification?.DvlaFuelType ?? null,
      bodyStyle: modelDetails?.BodyDetails?.BodyStyle ?? null,
      dvlaBodyType: vd?.VehicleIdentification?.DvlaBodyType ?? null,
      dvlaWheelPlan: vd?.VehicleIdentification?.DvlaWheelPlan ?? null,

      isImported: vd?.VehicleStatus?.IsImported ?? false,
      isImportedFromOutsideEu: vd?.VehicleStatus?.IsImportedFromOutsideEu ?? false,
      isScrapped: vd?.VehicleStatus?.IsScrapped ?? false,
      certificateOfDestructionIssued: vd?.VehicleStatus?.CertificateOfDestructionIssued ?? false,

      euroStatus: modelDetails?.Emissions?.EuroStatus ?? null,
      dvlaCo2: vd?.VehicleStatus?.VehicleExciseDutyDetails?.DvlaCo2 ?? null,
      dvlaCo2Band: vd?.VehicleStatus?.VehicleExciseDutyDetails?.DvlaCo2Band ?? null,

      kerbWeightKg: modelDetails?.Weights?.KerbWeightKg ?? null,
      grossCombinedWeightKg: modelDetails?.Weights?.GrossCombinedWeightKg ?? null,

      cylinderArrangement: modelDetails?.Powertrain?.IceDetails?.CylinderArrangement ?? null,
      numberOfCylinders: modelDetails?.Powertrain?.IceDetails?.NumberOfCylinders ?? null,
      aspiration: modelDetails?.Powertrain?.IceDetails?.Aspiration ?? null,
      transmissionType: modelDetails?.Powertrain?.Transmission?.TransmissionType ?? null,
      numberOfGears: modelDetails?.Powertrain?.Transmission?.NumberOfGears ?? null,
      drivingAxle: modelDetails?.Powertrain?.Transmission?.DrivingAxle ?? null,
      fuelTankCapacityLitres: modelDetails?.BodyDetails?.FuelTankCapacityLitres ?? null,

      ps: modelDetails?.Performance?.Power?.Ps ?? null,
      torqueNm: modelDetails?.Performance?.Torque?.Nm ?? null,
      torqueRpm: modelDetails?.Performance?.Torque?.Rpm ?? null,
      zeroToSixtyMph: modelDetails?.Performance?.Statistics?.ZeroToSixtyMph ?? null,
      zeroToOneHundredKph: modelDetails?.Performance?.Statistics?.ZeroToOneHundredKph ?? null,
      maxSpeedMph: modelDetails?.Performance?.Statistics?.MaxSpeedMph ?? null,
      maxSpeedKph: modelDetails?.Performance?.Statistics?.MaxSpeedKph ?? null,
      fuelEconomy,

      previousColour: vd?.VehicleHistory?.ColourDetails?.PreviousColour ?? null,

      pncDetail,
    };
  } catch (err) {
    console.error("VDG VDICheck fetch failed:", err);
    return null;
  }
}
