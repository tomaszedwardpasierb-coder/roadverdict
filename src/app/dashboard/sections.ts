// Place at: src/app/dashboard/sections.ts
//
// Deliberately its own plain module, not exported from DashboardShell.tsx
// (a 'use client' file) - dashboard/page.tsx is a Server Component, and a
// Next.js "use client" boundary can turn even a plain runtime constant
// (not just component exports) into a client-reference proxy when
// imported from server code, which /dashboard's own force-dynamic
// setting means would only ever surface as a real-request runtime
// failure, never a build-time or static-render one. A neutral, boundary-
// free module removes that ambiguity entirely rather than relying on it
// happening to work.
//
// The full set of dashboard tabs, and the single source of truth for
// what a `?tab=` value on /dashboard is allowed to be - dashboard/
// page.tsx imports this same array to validate the query param and to
// decide which single tab's content to actually build server-side,
// rather than keeping its own separately-maintained list that could
// drift out of sync with DashboardShell.tsx's own nav.
export const ALL_SECTIONS = ['dashboard', 'service', 'fuel', 'mods', 'bills', 'labour', 'fines', 'tolls', 'reminders', 'reports', 'shareLinks', 'story', 'vault', 'quoteChecker', 'costCalculator', 'buyingGuide', 'privacy', 'transferOwnership', 'security'] as const;
export type Section = (typeof ALL_SECTIONS)[number];
