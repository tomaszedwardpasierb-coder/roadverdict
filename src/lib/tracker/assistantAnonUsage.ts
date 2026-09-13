// Place at: src/lib/tracker/assistantAnonUsage.ts
//
// Per-day message cap for the AI assistant (src/app/api/assistant/route.ts)
// when nobody's signed in - 10 messages/day, enforced by BOTH a
// long-lived anonymous cookie AND the request's own IP address, so
// clearing cookies alone doesn't reset the count. A signed-in session
// never goes through this at all (see the route's own signedIn check) -
// it has its own, much more generous cap instead (see
// assistantSignedInUsage.ts), not zero limit.
import { getContainer } from "@/lib/cosmos";
import { generateToken, hashToken } from "@/lib/auth/crypto";
import { getDocWithEtag, replaceIfUnchanged } from "@/lib/tracker/atomicUpdate";

export const ASSISTANT_ANON_MESSAGE_LIMIT = 10;
export const ANON_ID_COOKIE = "rv_anon_id";
export const ANON_ID_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // ~400 days - the practical cap most browsers allow anyway

interface AssistantAnonUsageDoc {
  id: string;
  pk: string;
  type: "assistantAnonUsage";
  date: string; // UTC calendar date, "YYYY-MM-DD" - the count resets the moment this rolls over
  count: number;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function anonKeyFromCookieId(cookieId: string): string {
  return `anon:${hashToken(cookieId)}`;
}

function anonKeyFromIp(ip: string): string {
  return `ip:${hashToken(ip)}`;
}

function isConflict(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  return code === 409 || statusCode === 409;
}

// Checks the given key's count for today against the limit BEFORE
// incrementing - a request already at the cap is refused without
// bumping the count further, so a blocked flood of retries doesn't
// grow the stored number forever (harmless either way, just tidier).
//
// Previously a plain read-then-upsert with no etag guard - N concurrent
// requests near the cap could all read the same pre-increment count and
// all get through. Fixed with the same etag-conditioned pattern as the
// signed-in usage trackers, plus a create/conflict path for the first
// message of the day (or ever) for this key, since this doc might not
// exist yet unlike a UserDoc, which always does once someone's signed in.
async function checkAndIncrement(key: string): Promise<boolean> {
  const container = getContainer();
  const today = todayUtc();

  const existing = await getDocWithEtag<AssistantAnonUsageDoc>(key, key);
  if (!existing) {
    try {
      await container.items.create({ id: key, pk: key, type: "assistantAnonUsage", date: today, count: 1 });
      return true;
    } catch (err) {
      if (!isConflict(err)) throw err;
      // A concurrent request created it first - fall through and treat
      // it the same as any other pre-existing doc, below.
    }
  }

  const fresh = existing ?? (await getDocWithEtag<AssistantAnonUsageDoc>(key, key));
  if (!fresh) return false;

  const currentCount = fresh.doc.date === today ? fresh.doc.count : 0;
  if (currentCount >= ASSISTANT_ANON_MESSAGE_LIMIT) return false;

  const result = await replaceIfUnchanged<AssistantAnonUsageDoc>(
    key,
    key,
    fresh.etag,
    fresh.doc,
    (doc) => ({ ...doc, date: today, count: (doc.date === today ? doc.count : 0) + 1 }),
    (doc) => (doc.date === today ? doc.count : 0) < ASSISTANT_ANON_MESSAGE_LIMIT
  );
  return result.ok;
}

// Records this message against both trackers and reports whether the
// message is allowed - blocked the moment EITHER tracker is already at
// today's cap, not just the cookie one, since a cleared cookie alone
// shouldn't reset the count for someone still on the same IP.
export async function canSendAnonAssistantMessage(cookieId: string, ip: string): Promise<boolean> {
  const [cookieOk, ipOk] = await Promise.all([checkAndIncrement(anonKeyFromCookieId(cookieId)), checkAndIncrement(anonKeyFromIp(ip))]);
  return cookieOk && ipOk;
}

export function generateAnonId(): string {
  return generateToken().raw;
}
