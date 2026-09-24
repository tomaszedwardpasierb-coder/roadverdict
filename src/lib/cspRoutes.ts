// Place at: src/lib/cspRoutes.ts
//
// Which Content-Security-Policy each top-level route segment gets. Pure
// data + one predicate, imported by middleware (edge runtime) and by
// tests/unit/cspRoutes.test.ts - nothing Node-only may go in here.
//
// Why two policies exist at all: a script-src nonce is generated per
// request, so it only works for pages rendered per request. Pages that are
// prerendered at build time (so a traffic spike is served from static HTML
// instead of a full server render per visitor) contain Next's inline
// bootstrap scripts with NO nonce - under a nonce-only script-src the
// browser blocks every one of them and the page never hydrates. Those
// pages get 'unsafe-inline' for scripts instead; every other directive
// stays strict. They render no user-supplied or per-visitor content
// server-side, which is what makes that trade acceptable.

// Segments whose pages/handlers render per request. They keep the strict
// per-request nonce - this is where accounts, tokens and admin live.
export const STRICT_CSP_SEGMENTS = [
  'api',
  'dashboard',
  'login',
  'garage',
  'report',
  'car-report',
  'bike-transfer',
  'car-transfer',
  'tomasz',
  'pro',
  'privacy-draft',
] as const;

// Segments that are prerendered public pages ('' is the homepage). Also
// covers the static 404 page, since middleware sees the mistyped URL, never
// "/_not-found" - which is why the rule is "strict list, relaxed default"
// rather than the other way round.
export const PUBLIC_STATIC_SEGMENTS = [
  '',
  'about',
  'privacy',
  'motorcycles',
  'cars',
  'quote-checker',
  'cost-calculator',
  'buying-guide',
  'guides',
  'track',
] as const;

export function usesStrictNonceCsp(pathname: string): boolean {
  const segment = pathname.split('/')[1] ?? '';
  return (STRICT_CSP_SEGMENTS as readonly string[]).includes(segment);
}
