// Place at: src/lib/tracker/assistantAnonUsage.ts
//
// Per-day message cap for the AI assistant (src/app/api/assistant/route.ts)
// when nobody's signed in - 10 messages/day, enforced by BOTH a
// long-lived anonymous cookie AND the request's own IP address, so
// clearing cookies alone doesn't reset the count. A signed-in session
// never goes through this at all (see the route's own signedIn check) -
// there is no limit once logged in.
import { getContainer } from "@/lib/cosmos";
import { generateToken, hashToken } from "@/lib/auth/crypto";

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

// Checks the given key's count for today against the limit BEFORE
// incrementing - a request already at the cap is refused without
// bumping the count further, so a blocked flood of retries doesn't
// grow the stored number forever (harmless either way, just tidier).
async function checkAndIncrement(key: string): Promise<boolean> {
  const container = getContainer();
  const { resource } = await container.item(key, key).read<AssistantAnonUsageDoc>();
  const today = todayUtc();
  const currentCount = resource && resource.date === today ? resource.count : 0;
  if (currentCount >= ASSISTANT_ANON_MESSAGE_LIMIT) return false;
  const doc: AssistantAnonUsageDoc = { id: key, pk: key, type: "assistantAnonUsage", date: today, count: currentCount + 1 };
  await container.items.upsert(doc);
  return true;
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
