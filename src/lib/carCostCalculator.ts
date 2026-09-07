import { getAdjustedCarBenchmark, type CarBenchmarkClass, type CarRegion } from './carPriceData';
import { getCarVed, CAR_VED_CAVEAT } from './tracker/carVed';
import { getCurrentPetrolPricePenceLitre, getCurrentDieselPricePenceLitre } from './fuelPrice';
import type { CarFuelType } from './tracker/car';

/**
 * Car equivalent of costCalculator.ts. Same sourcing discipline - see
 * carPriceData.ts's own header for the servicing/tyres provenance.
 *
 * - MOT: DVSA's statutory cap for a car (Class 4) is £54.85, but (same
 *   precedent as the motorcycle module - a real average, not the legal
 *   ceiling) 2026 cost guides converge on £30-45 typically paid. £37
 *   used here, cap noted in the UI caveat.
 * - Road tax (VED): from carVed.ts's CO2-banded lookup - genuinely
 *   different from the motorcycle module's engine-size bands. Uses the
 *   STANDARD (year 2+) rate for this ongoing annual estimate, not the
 *   one-off first-year rate a brand-new registration actually pays.
 *   `co2Gkm` is a user-entered field (CarDoc doesn't capture it from
 *   DVLA data yet) - when absent, tax is estimated as £0 with an honest
 *   `vedUnknown` flag, rather than guessed.
 * - Fuel: petrol/diesel price both self-updating via fuelPrice.ts (same
 *   weekly DESNZ CSV, see update-fuel-price/route.ts). Average real-world
 *   MPG: petrol ~45, diesel ~55 (2026 UK fuel economy guides - WLTP
 *   claims run 15-25% higher than real-world driving). Hybrid/PHEV: no
 *   source splits these cleanly from petrol, so treated as petrol x a
 *   flagged, NOT sourced 1.3 multiplier - real-world PHEV fuel cost in
 *   particular depends heavily on charging habits and isn't modelled.
 * - Electric cars are out of scope entirely for this calculator (see the
 *   ADR's Phase 7 section) - not enough sourced servicing/tyre data yet.
 *   Callers must not reach this function for an electric-classed car;
 *   it throws rather than silently returning a guessed number.
 * - Tyre lifespan: NOT sourced, a flat rule-of-thumb figure needed to
 *   annualise a one-off tyre cost - cars wear tyres far more slowly than
 *   motorcycles (fewer aggressive lean-angle miles), so this is a much
 *   larger number than the bike module's own unsourced 5,000-mile figure,
 *   not a copy of it.
 */
const CAR_MOT_COST = 37;

const LITRES_PER_UK_GALLON = 4.546;
const AVERAGE_PETROL_CAR_MPG = 45;
const AVERAGE_DIESEL_CAR_MPG = 55;
const HYBRID_MPG_MULTIPLIER = 1.3; // not sourced - flagged above

const FUEL_MULTIPLIER_BY_CLASS: Record<CarBenchmarkClass, number> = {
  small: 0.85, // lighter cars, typically better mpg - not sourced
  medium: 1.0,
  large: 1.2, // bigger engines, typically worse mpg - not sourced
};

const TYPICAL_TYRE_LIFE_MILES = 20000; // rule of thumb, not sourced - flagged above

export interface CarAnnualCostBreakdown {
  servicing: number;
  tyres: number;
  mot: number;
  tax: number;
  fuel: number;
  total: number;
  vedUnknown: boolean;
  vedCaveat: string;
}

export async function computeCarAnnualCost(
  carClass: CarBenchmarkClass,
  brand: string,
  region: CarRegion,
  annualMileage: number,
  fuelType: CarFuelType,
  co2Gkm: number | undefined
): Promise<CarAnnualCostBreakdown> {
  if (fuelType === 'electric') {
    throw new Error(
      'Electric car running costs are not supported yet - not enough sourced servicing/tyre data for fully electric cars.'
    );
  }

  const service = getAdjustedCarBenchmark('full-service', carClass, brand, region);
  const servicing = Math.round((service.low + service.high) / 2);

  const tyrePair = getAdjustedCarBenchmark('tyres-front-pair', carClass, brand, region);
  const tyreMidpoint = (tyrePair.low + tyrePair.high) / 2;
  const tyreChangesPerYear = annualMileage / TYPICAL_TYRE_LIFE_MILES;
  const tyres = Math.round(tyreMidpoint * tyreChangesPerYear);

  const pricePenceLitre =
    fuelType === 'diesel' ? await getCurrentDieselPricePenceLitre() : await getCurrentPetrolPricePenceLitre();
  const baseMpg = fuelType === 'diesel' ? AVERAGE_DIESEL_CAR_MPG : AVERAGE_PETROL_CAR_MPG;
  const mpg = fuelType === 'hybrid' || fuelType === 'phev' ? baseMpg * HYBRID_MPG_MULTIPLIER : baseMpg;
  const fuelCostPerMileBase = (LITRES_PER_UK_GALLON / mpg) * (pricePenceLitre / 100);
  const fuel = Math.round(annualMileage * fuelCostPerMileBase * FUEL_MULTIPLIER_BY_CLASS[carClass]);

  const ved = getCarVed(co2Gkm);
  const tax = ved.unknown ? 0 : ved.standard;

  return {
    servicing,
    tyres,
    mot: CAR_MOT_COST,
    tax,
    fuel,
    total: servicing + tyres + CAR_MOT_COST + tax + fuel,
    vedUnknown: ved.unknown === true,
    vedCaveat: CAR_VED_CAVEAT,
  };
}
