// Place at: src/lib/tracker/vehicleTaxFetch.ts
//
// The VehicleTaxDetails VDG package call - vehicle-neutral (confirmed
// from a real sample response), used by Cost Calculator and the Buying
// Guide's free tier. Kept separate from vdiUnlock.ts/motHistory.ts
// (pure types, no fetch) same as vdiCheckFetch.ts/motHistoryFetch.ts.
// Deliberately does NOT return Model - this package only carries Make,
// confirmed from a real sample (unlike MotHistoryDetails, which carries
// both).
const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

export interface VehicleTaxDetails {
  make: string | null;
  taxStatus: string | null;
  taxIsCurrentlyValid: boolean;
  taxDueDate: string | null;
  taxDaysRemaining: number | null;
  motStatus: string | null;
  vedStandardTwelveMonths: number | null;
}

interface RawVehicleTaxResponse {
  ResponseInformation: { IsSuccessStatusCode: boolean };
  Results: {
    VehicleTaxDetails?: {
      Make?: string;
      TaxStatus?: string;
      TaxIsCurrentlyValid?: boolean;
      TaxDueDate?: string;
      TaxDaysRemaining?: number;
      MotStatus?: string;
      VehicleExciseDutyDetails?: {
        VedRate?: { Standard?: { TwelveMonths?: number | null } };
      };
    };
  };
}

export async function fetchVehicleTaxDetailsFromVdg(vrm: string, apiKey: string): Promise<VehicleTaxDetails | null> {
  try {
    const res = await fetch(`${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=VehicleTaxDetails&vrm=${encodeURIComponent(vrm)}`);
    const data: RawVehicleTaxResponse = await res.json();
    const details = data?.ResponseInformation?.IsSuccessStatusCode ? data.Results?.VehicleTaxDetails : undefined;
    if (!details) {
      return null;
    }

    return {
      make: details.Make ?? null,
      taxStatus: details.TaxStatus ?? null,
      taxIsCurrentlyValid: details.TaxIsCurrentlyValid ?? false,
      taxDueDate: details.TaxDueDate ?? null,
      taxDaysRemaining: details.TaxDaysRemaining ?? null,
      motStatus: details.MotStatus ?? null,
      vedStandardTwelveMonths: details.VehicleExciseDutyDetails?.VedRate?.Standard?.TwelveMonths ?? null,
    };
  } catch (err) {
    console.error("VDG VehicleTaxDetails fetch failed:", err);
    return null;
  }
}
