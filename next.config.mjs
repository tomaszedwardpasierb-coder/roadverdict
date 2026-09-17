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
  async headers() {
    return [
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
