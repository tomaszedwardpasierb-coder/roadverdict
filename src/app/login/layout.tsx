// Place at: src/app/login/layout.tsx
//
// /login and /login/verify-2fa are "use client" pages, which can't export
// route segment config themselves - this layout does it for them. They used
// to render per request only because the root layout read cookies(); now
// that it doesn't, they'd silently become static, and static HTML can't
// carry the per-request CSP nonce the sign-in pages are deliberately kept
// on (they're the highest-value XSS target on the site, so unlike the
// public marketing pages in middleware.ts's CACHEABLE_PUBLIC_PATHS they
// keep the strict policy). Cheap to render - no database work.
export const dynamic = 'force-dynamic';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
