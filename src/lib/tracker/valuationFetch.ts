// Place at: src/lib/tracker/valuationFetch.ts
//
// Deliberately NOT part of the creation-time dvlaData snapshot the rest
// of this file's siblings use - a valuation goes stale in a way keeper
// history or scrapped-status never does, so this is fetched live, on
// each report view, using the bike's real current mileage rather than
// whatever it was when first added. Confirmed via real testing that
// motorcycle coverage in this valuation book is genuinely incomplete
// (a real Royal Enfield came back empty, a real BMW came back with full
// figures) - "no data for this vehicle" is a normal, expected outcome
// here, not an error, and callers should treat it that way.
const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

export interface ValuationFigures {
  onTheRoad?: number;
  dealerForecourt?: number;
  tradeRetail?: number;
  privateClean?: number;
  privateAverage?: number;
  partExchange?: number;
  auction?: number;
  tradeAverage?: number;
  tradePoor?: number;
}

export interface ValuationResult {
  valuationMileage: number;
  figures: ValuationFigures;
}

export async function fetchValuationFromVdg(vrm: string, mileage: number): Promise<ValuationResult | null> {
  const apiKey = process.env.VDG_API_KEY;
  if (!apiKey) {
    console.error("VDG_API_KEY is not configured.");
    return null;
  }

  try {
    const res = await fetch(
      `${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=ValuationDetails&vrm=${encodeURIComponent(vrm)}&mileage=${mileage}`
    );
    const data = await res.json();

    if (!data?.ResponseInformation?.IsSuccessStatusCode || !data?.Results?.ValuationDetails) {
      return null;
    }

    const vd = data.Results.ValuationDetails;
    const fig = vd.ValuationFigures ?? {};

    // Real, empty-but-"successful" responses exist (StatusCode 2,
    // NoResultsFound, every figure null) - a technically-ok HTTP call
    // with nothing usable inside it. Treat that the same as a hard
    // failure rather than showing a card full of blanks.
    const hasAnyFigure = Object.values(fig).some((v) => v != null);
    if (!hasAnyFigure) return null;

    return {
      valuationMileage: vd.ValuationMileage,
      figures: {
        onTheRoad: fig.OnTheRoad,
        dealerForecourt: fig.DealerForecourt,
        tradeRetail: fig.TradeRetail,
        privateClean: fig.PrivateClean,
        privateAverage: fig.PrivateAverage,
        partExchange: fig.PartExchange,
        auction: fig.Auction,
        tradeAverage: fig.TradeAverage,
        tradePoor: fig.TradePoor,
      },
    };
  } catch (err) {
    console.error("VDG valuation fetch failed:", err);
    return null;
  }
}
