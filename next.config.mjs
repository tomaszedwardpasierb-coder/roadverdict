/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework in response headers
  // instrumentationHook was needed on Next.js 14 for src/instrumentation.ts
  // to run at all - it's stable and on by default since Next.js 15, and
  // now an actively-rejected unrecognized key rather than a harmless
  // no-op, so it's removed here rather than left in.
  //
  // applicationinsights uses Node-only built-ins (crypto, os, http,
  // https) that don't exist in the Edge runtime. instrumentation.ts is a
  // dual-runtime entry point - Next.js bundles it for both Node and Edge
  // targets at build time, regardless of the runtime guard inside the
  // file itself, since webpack statically sees the import either way.
  // This tells Next.js to skip bundling this package through webpack
  // entirely and use a native require() at runtime instead, so it's
  // never actually analyzed for Edge compatibility - the runtime guard
  // in instrumentation.ts is what ensures that require() only ever
  // actually happens in the real Node.js context anyway. Renamed from
  // experimental.serverComponentsExternalPackages, which the same
  // Next.js 15 upgrade moved out of experimental and stabilized.
  serverExternalPackages: ['applicationinsights'],
  // Both icon libraries are imported piecemeal (one icon at a time)
  // across dozens of files - without this, Next.js's own bundler still
  // has to consider each package's full barrel export graph per import
  // site rather than rewriting it straight to the specific icon module,
  // which slows cold builds/cold starts for no runtime benefit (the
  // final bundle was already tree-shaken correctly either way).
  experimental: {
    optimizePackageImports: ['lucide-react', 'react-icons'],
    // Puts each page's CSS in its own HTML instead of separate stylesheet
    // requests. Lighthouse showed three render-blocking stylesheets on the
    // homepage (~300 ms on slow 4G); the public pages are static now, so the
    // inlined CSS is just part of HTML that's prerendered once. Tradeoff: no
    // separate stylesheet caching across pages, so repeat page loads carry
    // the CSS again.
    // inlineCss: true,
  },
  images: {
    // AVIF first, WebP as the fallback. The hero image is ~28 KiB as AVIF
    // vs ~64 KiB as WebP q68 (both at 828w, what a 2x phone requests).
    formats: ['image/avif', 'image/webp'],
    // Optimized images are otherwise revalidated every 60s by default, which
    // under load means repeatedly re-encoding the same variants (AVIF costs
    // more CPU than WebP) on a single small instance. The cache lives in
    // .next and is replaced on every deploy, so a long TTL can't outlive a
    // change to a source image.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [
      {
        // PWA manifest icons (see src/app/manifest.ts) - unlike favicon.ico,
        // these aren't covered by Next's own static-asset caching, so they
        // shipped with the framework default (`max-age=0`, revalidate every
        // time) and re-downloaded their full body on every dashboard tab
        // switch. Content only ever changes by editing the file in place,
        // so `immutable` is safe as long as a real icon update also renames
        // the file (and its reference in manifest.ts) to bust this cache.
        source: '/icon-:size(192|512).png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // microphone=(self), not (self "https://roadverdict.co.uk") or the
          // default (self) omitted entirely - the assistant's voice input
          // (AssistantWidget.tsx) calls the Web Speech API, which needs
          // microphone access granted to this origin. The empty-allowlist
          // `()` this used to be blocks the feature at the browser-platform
          // level before the page's JS ever gets to request it - the
          // browser's own "this site wants to use your microphone" prompt
          // never even appears, on any browser, because the request never
          // reaches that stage. Camera and geolocation are still denied to
          // everyone - nothing in this app uses either.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
