// Place at: src/lib/notificationLink.ts
//
// Where an announcement from /tomasz may send people when they tap it: a
// page on this site (/dashboard, checked like any sign-in redirect), or
// RoadVerdict's own social pages - Facebook, Instagram, TikTok - over
// https. Nothing else: one link goes to every recipient at once, so an
// allow-list keeps a typo or a pasted look-alike from sending everyone
// somewhere unexpected.
import { getSafeRedirectPath } from "@/lib/auth/safeRedirect";

const SOCIAL_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.com",
  "www.fb.com",
  "fb.me",
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

export function getSafeNotificationLink(value: unknown): string | null {
  const internal = getSafeRedirectPath(value);
  if (internal) return internal;
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!SOCIAL_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url.toString();
}
