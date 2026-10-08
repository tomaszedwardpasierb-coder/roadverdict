// Place at: src/app/sitemap.ts
import type { MetadataRoute } from 'next';
import { PRICE_GUIDES, lastReviewed, priceGuideHubPath, priceGuidePath, type GuideVehicle } from '@/lib/seo/priceGuides';

const BASE = 'https://roadverdict.co.uk';

// When each page's own content last changed. Update the date when you
// change what a page says - not for sitewide changes like the footer.
// This used to send new Date() for every page on every request, which
// tells Google every page changed every time it looked, so it learns to
// ignore the field entirely; an honest date is a real signal to recrawl.
const PAGES: { path: string; lastModified: string; priority: number }[] = [
  { path: '/', lastModified: '2026-10-08', priority: 1 },
  { path: '/motorcycles', lastModified: '2026-09-27', priority: 0.9 },
  { path: '/cars', lastModified: '2026-09-27', priority: 0.9 },
  { path: '/quote-checker', lastModified: '2026-10-08', priority: 0.9 },
  { path: '/cars/quote-checker', lastModified: '2026-10-08', priority: 0.9 },
  { path: '/cost-calculator', lastModified: '2026-09-27', priority: 0.8 },
  { path: '/cars/cost-calculator', lastModified: '2026-09-27', priority: 0.8 },
  { path: '/buying-guide', lastModified: '2026-10-08', priority: 0.9 },
  { path: '/cars/buying-guide', lastModified: '2026-10-08', priority: 0.9 },
  { path: '/mpg-calculator', lastModified: '2026-09-28', priority: 0.8 },
  { path: '/guides', lastModified: '2026-10-07', priority: 0.7 },
  { path: '/guides/buying-a-used-motorcycle', lastModified: '2026-10-07', priority: 0.7 },
  { path: '/guides/buying-a-used-car', lastModified: '2026-10-07', priority: 0.7 },
  { path: '/guides/cost-of-owning-a-motorcycle', lastModified: '2026-10-07', priority: 0.7 },
  { path: '/guides/motorcycle-road-tax', lastModified: '2026-10-07', priority: 0.7 },
  { path: '/guides/cost-of-owning-a-car', lastModified: '2026-09-15', priority: 0.7 },
  { path: '/guides/proving-service-history', lastModified: '2026-10-06', priority: 0.7 },
  { path: '/guides/rebuild-lost-service-history', lastModified: '2026-10-06', priority: 0.7 },
  { path: '/pro', lastModified: '2026-10-08', priority: 0.5 },
  { path: '/about', lastModified: '2026-09-21', priority: 0.4 },
  { path: '/videos', lastModified: '2026-09-28', priority: 0.4 },
  { path: '/privacy', lastModified: '2026-10-08', priority: 0.2 },
];

// The price guides' copy and layout were written on this date; a page's
// date moves later when its underlying price data is re-reviewed.
const PRICE_GUIDE_CONTENT_DATE = '2026-09-27';

function latest(...dates: string[]): string {
  return [...dates].sort().at(-1)!;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const priceGuidePages = (Object.keys(PRICE_GUIDES) as GuideVehicle[]).flatMap((vehicle) => [
    { path: priceGuideHubPath(vehicle), lastModified: PRICE_GUIDE_CONTENT_DATE, priority: 0.8 },
    ...PRICE_GUIDES[vehicle].map((g) => ({
      path: priceGuidePath(g),
      lastModified: latest(PRICE_GUIDE_CONTENT_DATE, lastReviewed(g)),
      priority: 0.8,
    })),
  ]);
  return [...PAGES, ...priceGuidePages].map((p) => ({
    url: `${BASE}${p.path === '/' ? '/' : p.path}`,
    lastModified: new Date(`${p.lastModified}T00:00:00Z`),
    priority: p.priority,
  }));
}
