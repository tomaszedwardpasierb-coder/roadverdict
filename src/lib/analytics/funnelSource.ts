// Place at: src/lib/analytics/funnelSource.ts
//
// The pure half of the sign-up funnel (see funnel.ts): the source buckets
// and how a visit is sorted into one. No database import, so the browser
// beacon (components/FunnelBeacon.tsx) can use it too.
export const FUNNEL_SOURCES = [
  "facebook",
  "instagram",
  "youtube",
  "tiktok",
  "google",
  "bing",
  "reddit",
  "email",
  "app",
  // A buyer who followed the line on a shared report (report pages link
  // to /login?src=report) - the seller-to-buyer loop.
  "report",
  // The line under a free tool's result (components/LogbookNudge.tsx).
  "tool",
  // The "Create a free account" links on the sample-bike demo (/demo).
  "demo",
  "other",
  "direct",
] as const;
export type FunnelSource = (typeof FUNNEL_SOURCES)[number];

export function toFunnelSource(v: unknown): FunnelSource | null {
  return typeof v === "string" && (FUNNEL_SOURCES as readonly string[]).includes(v) ? (v as FunnelSource) : null;
}

// Where a visit came from, worked out from the page address's own
// ?utm_source / ?src and the referring site - the same buckets the
// funnel counts by. Shared by the browser beacon and the server.
export function classifySource(params: { utmSource?: string | null; src?: string | null; referrer?: string | null }): FunnelSource {
  const fromParam = toFunnelSource(params.src) ?? utmToSource(params.utmSource);
  if (fromParam) return fromParam;
  let host = "";
  try {
    host = params.referrer ? new URL(params.referrer).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }
  if (!host) return "direct";
  if (host.endsWith("roadverdict.co.uk")) return "direct";
  if (/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/.test(host)) return "facebook";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return "youtube";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (host === "mail.google.com" || /outlook|mail\./.test(host)) return "email";
  if (/(^|\.)google\./.test(host)) return "google";
  if (/(^|\.)bing\.com$/.test(host)) return "bing";
  if (/(^|\.)reddit\.com$/.test(host)) return "reddit";
  return "other";
}

function utmToSource(utm: string | null | undefined): FunnelSource | null {
  if (!utm) return null;
  const u = utm.toLowerCase();
  if (u === "meta" || u.startsWith("fb") || u.includes("facebook")) return "facebook";
  if (u.startsWith("ig") || u.includes("instagram")) return "instagram";
  if (u.startsWith("yt") || u.includes("youtube")) return "youtube";
  return toFunnelSource(u) ?? "other";
}

// The browsers built into the Facebook, Instagram, TikTok and similar
// apps - where signing in means leaving the app for an email.
export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /FBAN|FBAV|FB_IAB|Instagram|musical_ly|BytedanceWebview|TikTok|Snapchat|LinkedInApp|Pinterest|GSA\/|YouTube/i.test(userAgent);
}

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  return !userAgent || /bot|crawl|spider|slurp|preview|headless|curl|wget|python|httpclient|lighthouse|pagespeed/i.test(userAgent);
}
