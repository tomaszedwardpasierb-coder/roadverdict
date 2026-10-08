// Place at: src/lib/seo/reportPricingCopy.ts
//
// One place for how the full vehicle history report's price is worded on
// public pages - the homepage card, and the Buying Guide FAQs (bike and
// car, visible text and FAQPage markup both). The numbers come from the
// real price constants, so this copy can't drift from what checkout charges.
// The report's price depends on the account (see payments/pricing.ts), which
// is easy to muddle on a page; these are the plain wordings to use.
import { BUYING_GUIDE_REPORT_PRICE_LABEL } from '@/lib/payments/pricing';
import { PRO_ANNUAL_PRICE, PRO_MONTHLY_PRICE, PRO_TRIAL_DAYS } from '@/lib/proPlan';

const noVehicle = BUYING_GUIDE_REPORT_PRICE_LABEL.freeNoVehicle;
const withVehicle = BUYING_GUIDE_REPORT_PRICE_LABEL.freeWithVehicle;
const proSooner = BUYING_GUIDE_REPORT_PRICE_LABEL.pro;

/** One-line summary for the homepage card. */
export const REPORT_PRICE_SUMMARY = `Full history report: ${noVehicle}, or ${withVehicle} once you’ve added a vehicle to a free account. Included with Pro, one every 4 weeks.`;

/** Two FAQ entries for the Buying Guide pages (bike and car). */
export const REPORT_PRICING_FAQ = [
  {
    question: 'How much does the full vehicle history report cost?',
    answer: `${noVehicle}, or ${withVehicle} once you’ve added a vehicle to a free RoadVerdict account. Pro members get one free every 4 weeks, and pay ${proSooner} if they want another sooner.`,
  },
  {
    question: 'Is the vehicle history report included in Pro?',
    answer: `Yes. RoadVerdict Pro includes one full vehicle history report every 4 weeks. The free one starts with your first payment, so during the ${PRO_TRIAL_DAYS}-day free trial a report costs ${proSooner}. Pro is ${PRO_MONTHLY_PRICE} a month or ${PRO_ANNUAL_PRICE} a year.`,
  },
] as const;
