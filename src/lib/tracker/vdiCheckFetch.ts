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
import type { VdiCheckResult, VdiFinanceRecord, VdiKeeperChange, VdiWriteOffRecord, VdiPlateChange, VdiSoundLevels } from "./vdiUnlock";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

interface RawFinanceRecord {
  AgreementDate?: string;
  AgreementType?: string;
  FinanceCompany?: string;
}

interface RawKeeperChange {
  KeeperStartDate?: string;
  PreviousKeeperDisposalDate?: string | null;
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
// schema isn't trusted here).
interface RawVdiCheckResponse {
  ResponseInformation: { IsSuccessStatusCode: boolean };
  Results: {
    VehicleDetails?: {
      VehicleIdentification?: {
        DateFirstRegisteredInUk?: string;
        DateOfManufacture?: string;
      };
      VehicleStatus?: {
        VehicleExciseDutyDetails?: {
          VedRate?: {
            FirstYear?: { TwelveMonths?: number | null };
            Standard?: { TwelveMonths?: number | null; SixMonths?: number | null };
          };
        };
      };
      VehicleHistory?: {
        ColourDetails?: { CurrentColour?: string; OriginalColour?: string; NumberOfColourChanges?: number };
        KeeperChangeList?: RawKeeperChange[];
        PlateChangeList?: RawPlateChange[];
        V5cCertificateList?: unknown[];
      };
      DvlaTechnicalDetails?: {
        MassInServiceKg?: number | null;
      };
    };
    ModelDetails?: {
      ModelClassification?: { TaxationClass?: string };
      AdditionalInformation?: {
        VehicleWarrantyInformation?: {
          ManufacturerWarrantyMiles?: number | null;
          ManufacturerWarrantyMonths?: number | null;
        };
      };
      Emissions?: {
        SoundLevels?: { StationaryDb?: number | null; DriveByDb?: number | null; EngineSpeedRpm?: number | null };
      };
      Performance?: {
        Power?: { Bhp?: number | null };
      };
    };
    PncDetails?: { IsStolen?: boolean };
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
    };
  } catch (err) {
    console.error("VDG VDICheck fetch failed:", err);
    return null;
  }
}
