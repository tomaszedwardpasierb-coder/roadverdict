import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Per-request nonce, strict CSP. Deploy this in report-only mode first if you add any
// third-party script later (analytics, affiliate pixels) — see the SEO/security guide.
export function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'", // Next.js injects some inline styles; tighten with nonce once confirmed safe to remove
    "img-src 'self' data:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');

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
