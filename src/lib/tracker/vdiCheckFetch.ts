// Place at: src/lib/tracker/vdiCheckFetch.ts
//
// The VDICheck VDG package call, kept separate from vdiUnlock.ts (that
// file is deliberately pure types, no fetch) - same split as
// motHistory.ts/motHistoryFetch.ts. Shared by the report-unlock flow and
// the Buying Guide's VDI add-on (both bike and car - VDICheck's shape is
// identical regardless of vehicle kind, confirmed from a real sample
// response), rather than duplicating this VDG call four times.
import type { VdiCheckResult, VdiFinanceRecord } from "./vdiUnlock";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

interface RawFinanceRecord {
  AgreementDate?: string;
  AgreementType?: string;
  FinanceCompany?: string;
}

interface RawVdiCheckResponse {
  ResponseInformation: { IsSuccessStatusCode: boolean };
  Results: {
    VehicleDetails?: {
      VehicleStatus?: {
        DvlaCherishedTransferMarker?: boolean;
        VehicleExciseDutyDetails?: {
          VedRate?: {
            FirstYear?: { TwelveMonths?: number | null };
            Standard?: { TwelveMonths?: number | null };
          };
        };
      };
      VehicleHistory?: {
        ColourDetails?: { CurrentColour?: string; NumberOfColourChanges?: number };
        KeeperChangeList?: unknown[];
        PlateChangeList?: unknown[];
      };
    };
    PncDetails?: { IsStolen?: boolean };
    MiaftrDetails?: { WriteOffRecordList?: unknown[] };
    FinanceDetails?: { FinanceRecordList?: RawFinanceRecord[] };
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

    return {
      isStolen: data.Results.PncDetails?.IsStolen ?? false,
      hasWriteOffRecord: writeOffRecordList.length > 0,
      writeOffRecordCount: writeOffRecordList.length,
      hasOutstandingFinance: financeRecords.length > 0,
      financeRecords,
      keeperChangeCount: vd?.VehicleHistory?.KeeperChangeList?.length ?? 0,
      plateChangeCount: vd?.VehicleHistory?.PlateChangeList?.length ?? 0,
      colourChangeCount: vd?.VehicleHistory?.ColourDetails?.NumberOfColourChanges ?? 0,
      currentColour: vd?.VehicleHistory?.ColourDetails?.CurrentColour ?? null,
      vedFirstYearTwelveMonths: vd?.VehicleStatus?.VehicleExciseDutyDetails?.VedRate?.FirstYear?.TwelveMonths ?? null,
      vedStandardTwelveMonths: vd?.VehicleStatus?.VehicleExciseDutyDetails?.VedRate?.Standard?.TwelveMonths ?? null,
    };
  } catch (err) {
    console.error("VDG VDICheck fetch failed:", err);
    return null;
  }
}
