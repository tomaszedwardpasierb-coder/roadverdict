import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://roadverdict.co.uk';
  return [
    { url: `${base}/`, lastModified: new Date(), priority: 1 },
    { url: `${base}/quote-checker`, lastModified: new Date(), priority: 0.9 },
    { url: `${base}/cost-calculator`, lastModified: new Date(), priority: 0.9 },
    { url: `${base}/buying-guide`, lastModified: new Date(), priority: 0.9 },
    { url: `${base}/cars`, lastModified: new Date(), priority: 0.7 },
    { url: `${base}/cars/quote-checker`, lastModified: new Date(), priority: 0.9 },
    { url: `${base}/cars/cost-calculator`, lastModified: new Date(), priority: 0.9 },
    { url: `${base}/cars/buying-guide`, lastModified: new Date(), priority: 0.9 },
    { url: `${base}/pro`, lastModified: new Date(), priority: 0.6 },
    { url: `${base}/about`, lastModified: new Date(), priority: 0.4 },
    { url: `${base}/privacy`, lastModified: new Date(), priority: 0.2 },
  ];
}
