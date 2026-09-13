// Place at: src/lib/tracker/writeRateLimit.ts
//
// Generic per-account write throttle for the tracker's log-entry create
// routes (fuel, bills, bill series, fines, labour, mods, reminders,
// services, tolls - bike and car alike) - none of them had any rate
// limit at all before this, unlike auth/twoFactor.ts's
// checkTotpRateLimit/recordTotpAttempt or admin/session.ts's
// checkAdminLoginRateLimit/recordAdminLoginAttempt, which only cover
// login/2FA guessing. Same one-document-per-attempt, Cosmos-ttl-expired
// pattern as those two - no read-modify-write race (a plain counter
// field would have one, see atomicUpdate.ts's own comment on that
// shape), no cleanup needed (Cosmos ttl expires each attempt doc on its
// own).
//
// Unlike the auth-guessing limiters, which only record a FAILED attempt
// (a correct guess shouldn't cost the real user anything), this records
// every write attempt regardless of outcome - same reasoning as
// request-link's per-IP limiter: the action itself (creating records)
// is what's being capped here, not "wrong guesses" at a secret.
//
// One shared budget per account across every log-entry kind, not a
// separate counter per kind - simpler to reason about, and the thing
// actually being protected (total write volume/cost per account per
// window) doesn't care which category the writes landed in.
import { getContainer } from "@/lib/cosmos";

const ATTEMPT_ID_PREFIX = "tracker-write-attempt:";

// Generous on purpose - a real person manually backdating a big batch
// of historical records in one sitting (see backdateCheck.ts, a
// genuinely supported use case) can plausibly create dozens of entries
// in a few minutes; a script trying to run up thousands of Cosmos
// writes against one account hits this fast.
const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS_PER_WINDOW = 120;

function attemptId(): string {
  return `${ATTEMPT_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function isRateLimited(email: string): Promise<boolean> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string }>(
      {
        query: "SELECT c.id FROM c WHERE c.type = 'trackerWriteAttempt' AND STARTSWITH(c.id, @prefix)",
        parameters: [{ name: "@prefix", value: ATTEMPT_ID_PREFIX }],
      },
      { partitionKey: email }
    )
    .fetchAll();
  return resources.length >= MAX_ATTEMPTS_PER_WINDOW;
}

async function recordAttempt(email: string): Promise<void> {
  const container = getContainer();
  await container.items.create({
    id: attemptId(),
    pk: email,
    type: "trackerWriteAttempt",
    createdAt: new Date().toISOString(),
    ttl: WINDOW_SECONDS,
  });
}

// One call from the top of each create route, right after the session
// check and before any real work - true (and the attempt recorded) when
// under budget, false (and nothing recorded) once the caller is over
// it, so the route's own job is just to 429 on false.
export async function checkAndRecordWrite(email: string): Promise<boolean> {
  if (await isRateLimited(email)) return false;
  await recordAttempt(email);
  return true;
}
