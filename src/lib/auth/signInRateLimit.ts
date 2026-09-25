// Place at: src/lib/auth/signInRateLimit.ts
//
// Shared by every route that emails a sign-in credential (the web magic
// link and the app's 6-digit code). The per-email cooldowns in those
// routes only ever throttle requests for the SAME target email - they do
// nothing to stop a script from requesting a credential for a large
// number of DISTINCT emails (using this app's own transactional mailer as
// a spam/email-bombing relay), since each one individually stays under
// that limit. A per-IP ceiling closes that gap, same one-document-per-
// attempt, Cosmos-ttl-expired pattern twoFactor.ts's checkTotpRateLimit/
// recordTotpAttempt already use for an analogous "many attempts, one
// identity" budget. Generous on purpose - a shared office/cafe IP
// legitimately requesting several real accounts' links shouldn't be
// blocked, but a scripted burst against thousands of addresses will hit
// this fast. One budget across both routes, so switching from link to
// code doesn't double it.
import type { NextRequest } from "next/server";
import { getContainer } from "@/lib/cosmos";

const IP_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const IP_RATE_LIMIT_MAX_ATTEMPTS = 20;

// Azure sits in front of the app as a reverse proxy, so the real
// visitor IP arrives via this header, not the raw connection - the
// first entry is the original client, anything after it is
// intermediate proxies.
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function ipAttemptPrefix(ip: string): string {
  return `magic-link-ip-attempt:${ip}:`;
}

export async function isIpRateLimited(ip: string): Promise<boolean> {
  // Can't rate-limit an identity we can't actually distinguish - fails
  // open here rather than accidentally throttling every "unknown-ip"
  // request as if it were the same one caller.
  if (ip === "unknown") return false;
  const { resources } = await getContainer()
    .items.query<{ id: string }>(
      {
        query: "SELECT c.id FROM c WHERE c.type = 'magicLinkIpAttempt' AND STARTSWITH(c.id, @prefix)",
        parameters: [{ name: "@prefix", value: ipAttemptPrefix(ip) }],
      },
      { partitionKey: `ip:${ip}` }
    )
    .fetchAll();
  return resources.length >= IP_RATE_LIMIT_MAX_ATTEMPTS;
}

export async function recordIpAttempt(ip: string): Promise<void> {
  if (ip === "unknown") return;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await getContainer().items.create({
    id: `${ipAttemptPrefix(ip)}${suffix}`,
    pk: `ip:${ip}`,
    type: "magicLinkIpAttempt",
    createdAt: new Date().toISOString(),
    ttl: IP_RATE_LIMIT_WINDOW_SECONDS,
  });
}
