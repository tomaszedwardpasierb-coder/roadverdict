// Place at: src/lib/tracker/valuationFetch.ts
//
// The ValuationDetails VDG package call - car-only caller (see the ADR:
// motorcycle valuations were never in scope for this build), kept
// separate from vdiUnlock.ts (pure types, no fetch) same as
// vdiCheckFetch.ts/motHistoryFetch.ts.
import type { ValuationResult } from "./vdiUnlock";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

interface RawValuationResponse {
  ResponseInformation: { IsSuccessStatusCode: boolean };
  Results: {
    ValuationDetails?: {
      ValuationTime?: string;
      ValuationMileage?: number;
      VehicleDescription?: string;
      ValuationFigures?: {
        OnTheRoad?: number;
        DealerForecourt?: number;
        TradeRetail?: number;
        PrivateClean?: number;
        PrivateAverage?: number;
        PartExchange?: number;
        Auction?: number;
        TradeAverage?: number;
        TradePoor?: number;
      };
    };
  };
}

export async function fetchValuationFromVdg(vrm: string, apiKey: string): Promise<ValuationResult | null> {
  try {
    const res = await fetch(`${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=ValuationDetails&vrm=${encodeURIComponent(vrm)}`);
    const data: RawValuationResponse = await res.json();
    const vd = data?.ResponseInformation?.IsSuccessStatusCode ? data.Results?.ValuationDetails : undefined;
    if (!vd) {
      return null;
    }

    const figures = vd.ValuationFigures ?? {};
    return {
      valuationTime: vd.ValuationTime ?? null,
      valuationMileage: vd.ValuationMileage ?? null,
      vehicleDescription: vd.VehicleDescription ?? null,
      onTheRoad: figures.OnTheRoad ?? null,
      dealerForecourt: figures.DealerForecourt ?? null,
      tradeRetail: figures.TradeRetail ?? null,
      privateClean: figures.PrivateClean ?? null,
      privateAverage: figures.PrivateAverage ?? null,
      partExchange: figures.PartExchange ?? null,
      auction: figures.Auction ?? null,
      tradeAverage: figures.TradeAverage ?? null,
      tradePoor: figures.TradePoor ?? null,
    };
  } catch (err) {
    console.error("VDG ValuationDetails fetch failed:", err);
    return null;
  }
}
