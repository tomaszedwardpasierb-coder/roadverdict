// Place at: src/lib/webAnalytics.ts
//
// Which pages Cloudflare Web Analytics (src/components/WebAnalytics.tsx)
// stays off: pages whose address carries a private token - shared
// vehicle reports and ownership transfers - so those links never reach a
// third party, and the admin panel so its own visits don't inflate the
// numbers. /report also covers /report/receipt-request/decide, whose
// token sits in the query string.
const EXCLUDED_SECTIONS = ["/tomasz", "/report", "/car-report", "/bike-transfer", "/car-transfer"];

export function isAnalyticsExcluded(pathname: string): boolean {
  return EXCLUDED_SECTIONS.some((section) => pathname === section || pathname.startsWith(`${section}/`));
}
