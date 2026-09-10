import { z } from 'zod';
import { BRAND_OPTIONS } from './priceData';
import { CAR_BRAND_OPTIONS } from './carPriceData';

const brandValues = BRAND_OPTIONS.map((b) => b.value) as [string, ...string[]];
const carBrandValues = CAR_BRAND_OPTIONS.map((b) => b.value) as [string, ...string[]];

// Shared by every schema below that can carry a plate-lookup's real MOT
// history through to the AI advice generator - trimmed client-side to a
// handful of tests, so bounded generously here rather than tightly.
const motTestSchema = z.object({
  testDate: z.string(),
  passed: z.boolean(),
  notes: z.string(),
});
const motTestsField = z.array(motTestSchema).max(20).optional();

// Only ever present when a real VehicleTaxDetails lookup succeeded -
// see vehicleTaxFetch.ts for what each field means.
const taxStatusSchema = z.object({
  taxStatus: z.string().nullable(),
  taxIsCurrentlyValid: z.boolean(),
  taxDueDate: z.string().nullable(),
  taxDaysRemaining: z.number().nullable(),
  vedStandardTwelveMonths: z.number().nullable(),
});

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
  // Only present when the rider used the registration lookup and it
  // returned real MOT history - additive only, feeds the AI advice.
  motTests: motTestsField,
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const costCalculatorRequestSchema = z.object({
  bikeClass: z.enum(['small', 'medium', 'large']),
  brand: z.enum(brandValues),
  region: z.enum(['london-se', 'rest-england-wales', 'scotland-ni']),
  // A rider doing 0 or 100,000 miles a year on one bike is implausible —
  // bounded to keep the fuel/tyre math sane.
  annualMileage: z.number().positive().max(30000),
  motTests: motTestsField,
  taxStatus: taxStatusSchema.optional(),
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
  motTests: motTestsField,
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
  motTests: motTestsField,
  taxStatus: taxStatusSchema.optional(),
});

export type CarCostCalculatorRequest = z.infer<typeof carCostCalculatorRequestSchema>;

export const carBuyingGuideRequestSchema = z.object({
  carClass: z.enum(['small', 'medium', 'large', 'electric']),
  brand: z.enum(carBrandValues),
  ageBand: z.enum(['modern', 'used', 'classic']),
});

export type CarBuyingGuideRequest = z.infer<typeof carBuyingGuideRequestSchema>;
