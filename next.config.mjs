/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework in response headers
  // Required on Next.js 14 specifically for src/instrumentation.ts to run
  // at all - without this, the file is silently never called, not an
  // error, just nothing happening. Stable and on-by-default from Next.js
  // 15 onward; this flag becomes a harmless no-op once this app upgrades,
  // safe to leave in rather than something that needs removing later.
  experimental: {
    instrumentationHook: true,
    // applicationinsights uses Node-only built-ins (crypto, os, http,
    // https) that don't exist in the Edge runtime. instrumentation.ts is
    // a dual-runtime entry point - Next.js bundles it for both Node and
    // Edge targets at build time, regardless of the runtime guard inside
    // the file itself, since webpack statically sees the import either
    // way. This tells Next.js to skip bundling this package through
    // webpack entirely and use a native require() at runtime instead, so
    // it's never actually analyzed for Edge compatibility - the runtime
    // guard in instrumentation.ts is what ensures that require() only
    // ever actually happens in the real Node.js context anyway.
    serverComponentsExternalPackages: ['applicationinsights'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
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
