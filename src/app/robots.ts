// Place at: src/app/robots.ts
//
// The rules themselves live in lib/seo/robotsPolicy.ts, shared with the
// middleware - which is what actually answers /robots.txt in production,
// because a stale static robots.txt left on the server by an old deploy
// otherwise wins over this route (see robotsPolicy.ts). This file keeps
// the same policy for local development and as Next's own metadata route.
import type { MetadataRoute } from 'next';
import { ROBOTS_DISALLOW, SITEMAP_URL } from '@/lib/seo/robotsPolicy';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: [...ROBOTS_DISALLOW] }],
    sitemap: SITEMAP_URL,
  };
}
