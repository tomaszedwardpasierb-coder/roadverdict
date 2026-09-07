import { z } from 'zod';
import { BRAND_OPTIONS } from './priceData';
import { CAR_BRAND_OPTIONS } from './carPriceData';

const brandValues = BRAND_OPTIONS.map((b) => b.value) as [string, ...string[]];
const carBrandValues = CAR_BRAND_OPTIONS.map((b) => b.value) as [string, ...string[]];

export const quoteRequestSchema = z.object({
  bikeClass: z.enum(['small', 'medium', 'large']),
  jobType: z.enum([
    'basic-service',
    'full-service',
    'tyres-pair',
    'brake-pads-front',
    'chain-and-sprockets',
  ]),
  brand: z.enum(brandValues),
  region: z.enum(['london-se', 'rest-england-wales', 'scotland-ni']),
  // Bounded on both ends — a real quote won't be £0 or £50,000. This also protects
  // the verdict math from absurd inputs.
  quotedPrice: z.number().positive().max(5000),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const costCalculatorRequestSchema = z.object({
  bikeClass: z.enum(['small', 'medium', 'large']),
  brand: z.enum(brandValues),
  region: z.enum(['london-se', 'rest-england-wales', 'scotland-ni']),
  // A rider doing 0 or 100,000 miles a year on one bike is implausible —
  // bounded to keep the fuel/tyre math sane.
  annualMileage: z.number().positive().max(30000),
});

export type CostCalculatorRequest = z.infer<typeof costCalculatorRequestSchema>;

export const buyingGuideRequestSchema = z.object({
  bikeClass: z.enum(['small', 'medium', 'large']),
  brand: z.enum(brandValues),
  ageBand: z.enum(['modern', 'used', 'classic']),
});

export type BuyingGuideRequest = z.infer<typeof buyingGuideRequestSchema>;

export const carQuoteRequestSchema = z.object({
  carClass: z.enum(['small', 'medium', 'large']),
  jobType: z.enum(['oil-filter', 'interim-service', 'full-service', 'brake-pads-front', 'tyres-front-pair']),
  brand: z.enum(carBrandValues),
  region: z.enum(['london-se', 'rest-england-wales', 'scotland-ni']),
  // Bounded on both ends - a real quote won't be £0 or £50,000. This also
  // protects the verdict math from absurd inputs.
  quotedPrice: z.number().positive().max(5000),
});

export type CarQuoteRequest = z.infer<typeof carQuoteRequestSchema>;

export const carCostCalculatorRequestSchema = z.object({
  carClass: z.enum(['small', 'medium', 'large']),
  brand: z.enum(carBrandValues),
  region: z.enum(['london-se', 'rest-england-wales', 'scotland-ni']),
  fuelType: z.enum(['petrol', 'diesel', 'hybrid', 'phev']),
  // A driver doing 0 or 100,000 miles a year is implausible - bounded to
  // keep the fuel/tyre math sane.
  annualMileage: z.number().positive().max(30000),
  // Optional - CarDoc doesn't capture this from DVLA data yet, so it's a
  // manually-entered field (see carVed.ts). Bounded to the real GOV.UK
  // table's own top band.
  co2Gkm: z.number().nonnegative().max(999).optional(),
});

export type CarCostCalculatorRequest = z.infer<typeof carCostCalculatorRequestSchema>;

export const carBuyingGuideRequestSchema = z.object({
  carClass: z.enum(['small', 'medium', 'large', 'electric']),
  brand: z.enum(carBrandValues),
  ageBand: z.enum(['modern', 'used', 'classic']),
});

export type CarBuyingGuideRequest = z.infer<typeof carBuyingGuideRequestSchema>;
