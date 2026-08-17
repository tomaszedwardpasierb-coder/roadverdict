import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://roadverdict.co.uk';
  return [
    { url: `${base}/`, lastModified: new Date(), priority: 1 },
    { url: `${base}/quote-checker`, lastModified: new Date(), priority: 0.9 },
    { url: `${base}/cost-calculator`, lastModified: new Date(), priority: 0.9 },
    { url: `${base}/buying-guide`, lastModified: new Date(), priority: 0.9 },
    { url: `${base}/privacy`, lastModified: new Date(), priority: 0.2 },
  ];
}
