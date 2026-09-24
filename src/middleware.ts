import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_MARKER_COOKIE, IMPERSONATION_MARKER_COOKIE } from '@/lib/viewer';
import { usesStrictNonceCsp } from '@/lib/cspRoutes';

// Per-request nonce, strict CSP. Deploy this in report-only mode first if you add any
// third-party script later (analytics, affiliate pixels) — see the SEO/security guide.
//
// Everything except script-src (built once at module load, not
// reconstructed on every request) - this middleware's matcher below runs
// it on effectively every page/asset request, so a static array-and-join
// on every single one adds up for no reason. CSP directive order doesn't
// change how a browser applies them, so script-src can be spliced in
// anywhere relative to this string.
const STATIC_CSP_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Next.js injects some inline styles; tighten with nonce once confirmed safe to remove
  "img-src 'self' data:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

// Both roadverdict.co.uk and www.roadverdict.co.uk are bound as custom
// domains on Azure (see the DNS/cert fix that made www work at all), so
// without this, Google can index the identical site under two hostnames
// with nothing telling it which is canonical. The sitemap only ever
// lists the apex, so www needs to redirect there rather than serve its
// own 200.
function canonicalHostRedirect(request: NextRequest): NextResponse | null {
  const host = request.headers.get('host');
  if (host !== 'www.roadverdict.co.uk') return null;
  const url = new URL(request.url);
  url.host = 'roadverdict.co.uk';
  return NextResponse.redirect(url, 308);
}

// The session and impersonation cookies are httpOnly, so client code can't
// see them - and the public pages are now static, so the server can't
// tailor them per visitor either. These non-secret marker cookies mirror
// only "does that cookie exist", letting client code skip the network
// request entirely for the anonymous majority instead of every visitor
// paying for a lookup that will just say "not signed in". Kept in sync
// here because this runs on every request, including ones a static page
// is served from, with no per-route wiring to forget.
function syncMarkerCookie(request: NextRequest, response: NextResponse, sourceCookie: string, markerCookie: string) {
  const sourcePresent = request.cookies.has(sourceCookie);
  const markerPresent = request.cookies.get(markerCookie)?.value === '1';
  if (sourcePresent && !markerPresent) {
    response.cookies.set(markerCookie, '1', { path: '/', sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 30 });
  } else if (!sourcePresent && request.cookies.has(markerCookie)) {
    response.cookies.delete(markerCookie);
  }
}

function withMarkers(request: NextRequest, response: NextResponse): NextResponse {
  syncMarkerCookie(request, response, 'session', AUTH_MARKER_COOKIE);
  syncMarkerCookie(request, response, 'impersonating_as', IMPERSONATION_MARKER_COOKIE);
  return response;
}

export function middleware(request: NextRequest) {
  const redirect = canonicalHostRedirect(request);
  if (redirect) return redirect;

  const { pathname } = request.nextUrl;

  // Signed-in visitors used to be bounced from the homepage to the
  // dashboard by the page itself, via a server-side session check - which
  // is exactly what kept the homepage from being static. Cookie presence
  // is enough to decide here: /dashboard does the real validation and
  // sends anyone with a stale cookie on to /login.
  if (pathname === '/' && request.cookies.has('session')) {
    return withMarkers(request, NextResponse.redirect(new URL('/dashboard', request.url)));
  }

  // See src/lib/cspRoutes.ts for why prerendered public pages can't use a
  // nonce and which routes keep the strict policy. The default here is the
  // relaxed one on purpose: it's the safe failure direction (a missing
  // classification costs a weaker script-src, not a page that never
  // hydrates), and tests/unit/cspRoutes.test.ts fails on any top-level
  // route nobody has classified.
  if (!usesStrictNonceCsp(pathname)) {
    const response = NextResponse.next();
    response.headers.set('Content-Security-Policy', `script-src 'self' 'unsafe-inline'; ${STATIC_CSP_DIRECTIVES}`);
    return withMarkers(request, response);
  }

  const nonce = crypto.randomUUID();
  const csp = `script-src 'self' 'nonce-${nonce}'; ${STATIC_CSP_DIRECTIVES}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return withMarkers(request, response);
}

export const config = {
  matcher: [
    // Skip static assets and Next internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
