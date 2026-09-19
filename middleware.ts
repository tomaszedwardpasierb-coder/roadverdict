import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

export function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const csp = `script-src 'self' 'nonce-${nonce}'; ${STATIC_CSP_DIRECTIVES}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and Next internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
