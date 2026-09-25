// Place at: src/lib/auth/appLoginCode.ts
//
// The Android app's first sign-in factor: a 6-digit code emailed to the
// account, typed into the app. A magic link can't serve here on its own -
// tapping it opens the browser, which signs the browser in, not the app.
//
// A 6-digit code is far easier to guess than a magic link's 256-bit
// token, so three limits stack up to keep guessing impractical:
//   - one live code per account (a new request replaces the old one),
//     and a new one at most once a minute, like magic links;
//   - each code dies after MAX_GUESSES_PER_CODE wrong guesses;
//   - an account takes at most MAX_FAILED_GUESSES_PER_WINDOW wrong
//     guesses per window across every code, so requesting fresh codes
//     doesn't reset the budget.
// Only a hash of the code is stored, same as magic links and sessions.
import { randomInt, timingSafeEqual } from "crypto";
import { getContainer } from "@/lib/cosmos";
import { hashToken } from "@/lib/auth/crypto";

const CODE_DOC_ID = "app-login-code";
export const APP_CODE_TTL_SECONDS = 10 * 60;
const REQUEST_COOLDOWN_MS = 60_000;
const MAX_GUESSES_PER_CODE = 5;
const FAILED_GUESS_WINDOW_SECONDS = 6 * 60 * 60;
const MAX_FAILED_GUESSES_PER_WINDOW = 20;

type AppLoginCodeDoc = {
  id: string;
  pk: string;
  type: "appLoginCode";
  codeHash: string;
  guesses: number;
  createdAt: string;
  expiresAt: string;
  ttl: number;
  _etag?: string;
};

// Salted with the email so the same code for two accounts never hashes
// the same.
function hashCode(email: string, code: string): string {
  return hashToken(`${email}:${code}`);
}

async function readCodeDoc(email: string): Promise<AppLoginCodeDoc | null> {
  try {
    const { resource } = await getContainer().item(CODE_DOC_ID, email).read<AppLoginCodeDoc>();
    return resource && resource.type === "appLoginCode" ? resource : null;
  } catch {
    return null;
  }
}

export async function isAppCodeRequestCoolingDown(email: string): Promise<boolean> {
  const doc = await readCodeDoc(email);
  return !!doc && Date.now() - new Date(doc.createdAt).getTime() < REQUEST_COOLDOWN_MS;
}

export async function createAppLoginCode(email: string): Promise<string> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = new Date();
  await getContainer().items.upsert({
    id: CODE_DOC_ID,
    pk: email,
    type: "appLoginCode",
    codeHash: hashCode(email, code),
    guesses: 0,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + APP_CODE_TTL_SECONDS * 1000).toISOString(),
    ttl: APP_CODE_TTL_SECONDS,
  });
  return code;
}

function attemptPrefix(): string {
  return "app-login-code-attempt:";
}

export async function isAppCodeGuessingLocked(email: string): Promise<boolean> {
  const { resources } = await getContainer()
    .items.query<{ id: string }>(
      {
        query: "SELECT c.id FROM c WHERE c.type = 'appLoginCodeAttempt' AND STARTSWITH(c.id, @prefix)",
        parameters: [{ name: "@prefix", value: attemptPrefix() }],
      },
      { partitionKey: email }
    )
    .fetchAll();
  return resources.length >= MAX_FAILED_GUESSES_PER_WINDOW;
}

async function recordFailedGuess(email: string): Promise<void> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await getContainer().items.create({
    id: `${attemptPrefix()}${suffix}`,
    pk: email,
    type: "appLoginCodeAttempt",
    createdAt: new Date().toISOString(),
    ttl: FAILED_GUESS_WINDOW_SECONDS,
  });
}

function isPreconditionFailedOrMissing(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  return [404, 412].includes(code as number) || [404, 412].includes(statusCode as number);
}

// "expired" covers every reason the code can't be used any more (none
// requested, too old, too many wrong guesses, already used) - the app
// shows the same "request a new code" message for all of them.
export async function consumeAppLoginCode(email: string, code: string): Promise<"ok" | "invalid" | "expired"> {
  const doc = await readCodeDoc(email);
  if (!doc || new Date(doc.expiresAt) < new Date() || doc.guesses >= MAX_GUESSES_PER_CODE) return "expired";

  const expected = Buffer.from(doc.codeHash, "hex");
  const actual = Buffer.from(hashCode(email, code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await recordFailedGuess(email);
    try {
      await getContainer()
        .item(CODE_DOC_ID, email)
        .patch({
          operations: [{ op: "incr", path: "/guesses", value: 1 }],
          condition: `from c where c.guesses < ${MAX_GUESSES_PER_CODE}`,
        });
    } catch (err) {
      if (!isPreconditionFailedOrMissing(err)) throw err;
    }
    return "invalid";
  }

  // Conditioned on the exact version just read, so two racing requests
  // with the right code can't both turn it into a session - the same
  // reason verify/route.ts conditions its magic-link "used" patch.
  try {
    await getContainer().item(CODE_DOC_ID, email).delete({ accessCondition: { type: "IfMatch", condition: doc._etag ?? "" } });
  } catch (err) {
    if (isPreconditionFailedOrMissing(err)) return "expired";
    throw err;
  }
  return "ok";
}
