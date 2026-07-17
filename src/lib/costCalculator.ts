import { getAdjustedBenchmark, type BikeClass, type Region } from './priceData';
import { getCurrentPetrolPricePenceLitre } from './fuelPrice';
/**
 * Cost breakdown sourcing notes - same spirit as priceData.ts.
 *
 * - Servicing, tyres: reused directly from priceData.ts. Same confidence
 *   levels apply (see that file's header comment).
 * - MOT: sourced. DVSA's statutory cap is £29.65, but the real average
 *   market rate independents actually charge was reported at £28.10 in
 *   January 2026 by a cost-of-ownership guide - used that instead of the
 *   cap since it reflects what people actually pay.
 * - Road tax (VED): now sourced directly from the official DVLA rates table
 *   (gov.uk V149, effective 1 April 2026), not a secondary site. Real bands
 *   by engine size: not over 150cc £27, 151-400cc £59, 401-600cc £90, over
 *   600cc £125. That last boundary (600cc, not 750cc) doesn't line up with
 *   RoadVerdict's own small/medium/large split - most bikes people'd call
 *   "medium" (a 650, a 689cc MT-07) are actually over 600cc and therefore
 *   in the £125 band, not £90. Mapped below accordingly. Re-check every
 *   April when DVLA updates these - the boundaries are stable, the amounts
 *   move with inflation most years.
 * - Fuel: sourced, and now genuinely self-updating rather than a constant
 *   someone has to remember to change. A weekly job (see
 *   /api/cron/update-fuel-price) fetches DESNZ's official weekly road
 *   fuel prices CSV every week and stores the current UK average petrol
 *   price in Cosmos DB. This function reads that stored value at request
 *   time. If that read ever fails (Cosmos unreachable, cron hasn't run
 *   yet on a fresh deploy), it falls back to a hardcoded constant - see
 *   fuelPrice.ts for that value and its date. Average motorcycle mpg (57)
 *   is still NOT auto-updating - that figure moves far less often and
 *   isn't available as an open weekly dataset the way fuel price is, so
 *   it stays a periodically-checked constant.
 * - Tyre lifespan (miles before replacement): NOT sourced at all. A flat
 *   rule-of-thumb number, needed to turn a one-off tyre cost into an
 *   annual figure. This is the shakiest assumption in this whole module -
 *   real tyre life varies hugely with riding style and tyre choice.
 */
const MOT_COST = 28; // per year (bikes need one from year 3 onward - shown as if annual for simplicity)
const VED_BY_CLASS: Record<BikeClass, number> = {
  small: 59, // covers 151-400cc band; a sub-150cc learner bike would actually pay £27, not £59 - flagged imprecision
  medium: 125, // most "medium" bikes (650s, 689cc) are over the 600cc line, so this is the over-600cc rate, not the 401-600cc one
  large: 125,
};

const LITRES_PER_UK_GALLON = 4.546;
const AVERAGE_MOTORCYCLE_MPG = 57; // sourced, see header comment - not auto-updating

const FUEL_MULTIPLIER_BY_CLASS: Record<BikeClass, number> = {
  small: 0.85, // lighter bikes, typically better mpg - not sourced
  medium: 1.0,
  large: 1.2, // bigger engines, typically worse mpg - not sourced
};
const TYPICAL_TYRE_LIFE_MILES = 5000; // rule of thumb, not sourced - flagged above
export interface AnnualCostBreakdown {
  servicing: number;
  tyres: number;
  mot: number;
  tax: number;
  fuel: number;
  total: number;
}
export async function computeAnnualCost(
  bikeClass: BikeClass,
  brand: string,
  region: Region,
  annualMileage: number
): Promise<AnnualCostBreakdown> {
  const service = getAdjustedBenchmark('full-service', bikeClass, brand, region);
  const servicing = Math.round((service.low + service.high) / 2);
  const tyrePair = getAdjustedBenchmark('tyres-pair', bikeClass, brand, region);
  const tyreMidpoint = (tyrePair.low + tyrePair.high) / 2;
  const tyreChangesPerYear = annualMileage / TYPICAL_TYRE_LIFE_MILES;
  const tyres = Math.round(tyreMidpoint * tyreChangesPerYear);

  const petrolPricePenceLitre = await getCurrentPetrolPricePenceLitre();
  const fuelCostPerMileBase =
    (LITRES_PER_UK_GALLON / AVERAGE_MOTORCYCLE_MPG) * (petrolPricePenceLitre / 100);
  const fuel = Math.round(
    annualMileage * fuelCostPerMileBase * FUEL_MULTIPLIER_BY_CLASS[bikeClass]
  );

  const tax = VED_BY_CLASS[bikeClass];
  const mot = MOT_COST;
  return {
    servicing,
    tyres,
    mot,
    tax,
    fuel,
    total: servicing + tyres + mot + tax + fuel,
  };
}
