// Place at: src/lib/tracker/carVed.ts
//
// Car VED (road tax) — a genuinely different lookup shape from the
// motorcycle one in costCalculator.ts, banded by CO2 emissions
// (g/km), not engine size. Source: GOV.UK's official vehicle tax rate
// table (gov.uk/vehicle-tax-rate-tables), cars registered on or after
// 2017-04-01, checked 2026-09-07.
//
// Two deliberate simplifications, both disclosed rather than silently
// wrong:
// - The "Petrol/Alternative fuel" column is used for every fuel type
//   CarDoc models except diesel (petrol, hybrid, PHEV, and electric —
//   DVLA's own "alternative fuel" category already covers hybrids/PHEVs,
//   and 0 g/km lands an EV in the same £10 first-year band). Diesel uses
//   the RDE2-compliant column, not the worse non-RDE2 one — CarDoc has no
//   RDE2-compliance flag, and most diesels sold since Sept 2019 comply,
//   so this is the right default for most cars but can understate the
//   rate for an older non-compliant diesel.
// - The £40k-list-price "expensive car supplement" (+£440/year for 5
//   years from the second payment) is NOT modeled — CarDoc doesn't
//   capture a car's original list price. Every caller-facing result
//   should carry a caveat pointing to GOV.UK for the exact figure, same
//   spirit as costCalculator.ts's own real-vs-approximate VED note.
//
// Re-check every April when DVLA updates these — the CO2 bands
// themselves are stable, the amounts move with inflation most years.

interface CarVedBand {
  maxCo2Gkm: number; // inclusive upper bound; Infinity for the top band
  firstYearRate: number;
}

const CAR_VED_FIRST_YEAR_BANDS: CarVedBand[] = [
  { maxCo2Gkm: 0, firstYearRate: 10 },
  { maxCo2Gkm: 50, firstYearRate: 115 },
  { maxCo2Gkm: 75, firstYearRate: 135 },
  { maxCo2Gkm: 90, firstYearRate: 280 },
  { maxCo2Gkm: 100, firstYearRate: 365 },
  { maxCo2Gkm: 110, firstYearRate: 405 },
  { maxCo2Gkm: 130, firstYearRate: 455 },
  { maxCo2Gkm: 150, firstYearRate: 560 },
  { maxCo2Gkm: 170, firstYearRate: 1410 },
  { maxCo2Gkm: 190, firstYearRate: 2270 },
  { maxCo2Gkm: 225, firstYearRate: 3420 },
  { maxCo2Gkm: 255, firstYearRate: 4850 },
  { maxCo2Gkm: Infinity, firstYearRate: 5690 },
];

// Flat from year 2 onward, every fuel type — the old EV exemption ended;
// an EV registered after 2026-04-01 also pays this once past year one.
export const CAR_VED_STANDARD_RATE = 200;

export const CAR_VED_CAVEAT =
  'Estimate only, based on published CO2 bands - excludes the £40,000+ list-price supplement. Check GOV.UK for your exact figure.';

export interface CarVedResult {
  unknown?: false;
  firstYear: number;
  standard: number;
}

export interface CarVedUnknown {
  unknown: true;
  message: string;
}

export function getCarVed(co2Gkm: number | undefined): CarVedResult | CarVedUnknown {
  if (co2Gkm === undefined || !Number.isFinite(co2Gkm) || co2Gkm < 0) {
    return { unknown: true, message: 'VED varies - check GOV.UK for the exact current figure.' };
  }
  const band =
    CAR_VED_FIRST_YEAR_BANDS.find((b) => co2Gkm <= b.maxCo2Gkm) ??
    CAR_VED_FIRST_YEAR_BANDS[CAR_VED_FIRST_YEAR_BANDS.length - 1];
  return { firstYear: band.firstYearRate, standard: CAR_VED_STANDARD_RATE };
}
