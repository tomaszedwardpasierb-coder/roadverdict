// Place at: src/lib/seo/robotsPolicy.ts
//
// The one robots policy, shared by app/robots.ts and the middleware.
// Pure data and string-building only - the middleware runs on the edge
// runtime, so nothing here may import a Node-only module.
//
// Why the middleware serves robots.txt itself (2026-09-26): deployments
// add and replace files on the App Service but never delete old ones, and
// a stale public/robots.txt from an early deploy was still sitting in
// wwwroot. Next.js serves public files before app routes, so that stale
// file silently replaced this policy in production - it allowed crawling
// of /report/, /car-report/, the transfer links and /tomasz, all of which
// carry private tokens or are admin-only. Middleware runs before the
// filesystem, so answering /robots.txt there makes this policy the one
// served regardless of what's lying around on the server.

export const SITE_URL = 'https://roadverdict.co.uk';

export const ROBOTS_DISALLOW = [
  '/login',
  '/dashboard',
  '/garage',
  '/tomasz',
  '/report/',
  '/car-report/',
  '/bike-transfer/',
  '/car-transfer/',
  '/privacy-draft',
  '/api/',
] as const;

export const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;

export function buildRobotsTxt(): string {
  return ['User-Agent: *', ...ROBOTS_DISALLOW.map((path) => `Disallow: ${path}`), '', `Sitemap: ${SITEMAP_URL}`, ''].join('\n');
}
