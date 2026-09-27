// Place at: src/lib/affiliates.ts
//
// Sportsbikeshop affiliate links - motorcycles only (Sportsbikeshop sells
// bike parts, gear and security, nothing for cars).
//
// House rules for every affiliate link on RoadVerdict:
//   - Text only, one short line, only where someone is already dealing
//     with that job ("doing it yourself? here are the parts"). No banners,
//     nothing on the homepage or any car page.
//   - Never inside a verdict or changing one: the quote checker shows its
//     line whatever the verdict says.
//   - Always labelled "Affiliate link" (UK advertising rules), and always
//     rel="sponsored" (Google's rule for paid links).
//   - At most two links per line.
//
// Link format, from Sportsbikeshop's affiliate link builder: any page on
// their site + "#/<affiliate id>,<source>,<campaign>". Sources are created
// in their dashboard (Tools -> Sources and campaigns); set the numbers
// below once they exist so their reports show which placement earns.
// 0 means "no source".
export const SPORTSBIKESHOP_AFFILIATE_ID = '28990';

export const SPORTSBIKESHOP_SOURCE = {
  priceGuides: 0,
  tracker: 0,
  quoteChecker: 0,
  guides: 0,
} as const;

export type AffiliateSource = keyof typeof SPORTSBIKESHOP_SOURCE;

// Category pages on sportsbikeshop.co.uk, each checked to load a real,
// stocked listing (2026-09-27). The chain link is the "Chains & Sprockets"
// category (785), not "Chain & Sprocket Kits" (466), which only listed
// two sprocket carriers when checked.
const CATEGORY = {
  'brake-pads': { label: 'Brake pads', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_cat/763' },
  'chains-sprockets': { label: 'Chains & sprockets', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_cat/785' },
  'oil-filters': { label: 'Oil filters', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_cat/845' },
  'air-filters': { label: 'Air filters', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_cat/1384' },
  'spark-plugs': { label: 'Spark plugs', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_cat/1385' },
  batteries: { label: 'Batteries', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_cat/1386' },
  tyres: { label: 'Tyres', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_group/_/%287;product_rating;DESC;0-0;all%29' },
  'engine-oil': { label: 'Engine oil', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_group/_/%2847;product_rating;DESC;0-0;all%29' },
  'disc-locks': { label: 'Disc locks', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_group/_/%2872;product_rating;DESC;0-0;all%29' },
  'security-chains': { label: 'Security chains', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_group/_/%2823;product_rating;DESC;0-0;all%29' },
  helmets: { label: 'Helmets', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_group/_/%281;product_rating;DESC;0-0;all%29' },
  jackets: { label: 'Jackets', url: 'https://www.sportsbikeshop.co.uk/motorcycle_parts/content_group/_/%284;product_rating;DESC;0-0;all%29' },
} as const;

export type SportsbikeshopCategory = keyof typeof CATEGORY;

// Which parts fit each motorcycle job type (the tracker's and the quote
// checker's job keys). Jobs with no good parts match - valve checks,
// fluid flushes, valets - get no link at all.
export const SPORTSBIKESHOP_FOR_JOB: Record<string, SportsbikeshopCategory[]> = {
  'basic-service': ['engine-oil', 'oil-filters'],
  'full-service': ['engine-oil', 'oil-filters'],
  'oil-filter': ['engine-oil', 'oil-filters'],
  'spark-plugs': ['spark-plugs'],
  'air-filter': ['air-filters'],
  'brake-pads-front': ['brake-pads'],
  'brake-pads-rear': ['brake-pads'],
  'tyres-pair': ['tyres'],
  'tyres-front': ['tyres'],
  'tyres-rear': ['tyres'],
  'chain-and-sprockets': ['chains-sprockets'],
  battery: ['batteries'],
};

export type AffiliateLink = { label: string; href: string };

export function sportsbikeshopLinks(categories: readonly SportsbikeshopCategory[], source: AffiliateSource): AffiliateLink[] {
  return categories.slice(0, 2).map((c) => ({
    label: CATEGORY[c].label,
    href: `${CATEGORY[c].url}#/${SPORTSBIKESHOP_AFFILIATE_ID},${SPORTSBIKESHOP_SOURCE[source]},0`,
  }));
}

export function sportsbikeshopLinksForJob(jobType: string | null | undefined, source: AffiliateSource): AffiliateLink[] {
  const categories = jobType ? SPORTSBIKESHOP_FOR_JOB[jobType] : undefined;
  return categories ? sportsbikeshopLinks(categories, source) : [];
}
