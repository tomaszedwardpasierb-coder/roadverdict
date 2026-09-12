// Place at: src/lib/tracker/vaultAudit.ts
//
// The Vault's own access trail (spec: "Vault last opened: <date> -
// <browser>, <country>", last 5 events, no full audit trail needed).
// Nothing in this codebase parses a user-agent string or resolves an IP
// to a country today (sessions just store the raw strings) - both are
// genuinely new here.
import { getContainer } from "@/lib/cosmos";
import { getUserDoc, type UserDoc } from "@/lib/tracker/userDoc";

const MAX_VAULT_ACCESS_LOG_ENTRIES = 5;
const GEO_LOOKUP_TIMEOUT_MS = 1500;

export type VaultAccessEvent = NonNullable<UserDoc["vaultAccessLog"]>[number];

// Simple substring checks, not a UA-parsing library (none is a
// dependency of this app). Order matters - Edge and Opera's user-agent
// strings both also contain "Chrome", and Chrome's also contains
// "Safari", so the more specific token has to be checked first or every
// browser would misreport as whichever generic engine it's built on.
export function detectBrowser(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/OPR\//.test(userAgent)) return "Opera";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Unknown browser";
}

// Best-effort only, on purpose - a Vault unlock must never fail, or even
// feel slow, because a free third-party geo-IP service is unavailable or
// slow to respond. Skips the network call entirely for anything that
// isn't a real routable address (the "unknown"/loopback values every
// getClientIp fallback in this app already produces, e.g. in local dev
// with no forwarding header present).
export async function lookupCountry(ip: string): Promise<string | null> {
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1") return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country_name/`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text && !/error/i.test(text) ? text : null;
  } catch {
    return null;
  }
}

// Writes one new access event (newest first, capped at 5) and returns
// whatever was the most recent entry BEFORE this write - that's the
// meaningful "this was opened before, at X" trust signal the Vault UI
// shows, not the unlock that's happening right now (which would just
// read "just now, obviously" and tell the user nothing useful).
export async function recordVaultAccess(email: string, event: { browser: string; country: string | null }): Promise<VaultAccessEvent | null> {
  const user = await getUserDoc(email);
  if (!user) return null;

  const previousAccess = user.vaultAccessLog?.[0] ?? null;
  const newEntry: VaultAccessEvent = { at: new Date().toISOString(), browser: event.browser, country: event.country };
  user.vaultAccessLog = [newEntry, ...(user.vaultAccessLog ?? [])].slice(0, MAX_VAULT_ACCESS_LOG_ENTRIES);

  const container = getContainer();
  await container.items.upsert(user);

  return previousAccess;
}
