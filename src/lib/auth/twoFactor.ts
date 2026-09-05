// Place at: src/lib/auth/twoFactor.ts
//
// Cosmos-backed state for per-user 2FA: enrollment (pending, then
// confirmed onto the user doc), disabling, backup codes, and the
// pending-login step magic-link verify hands off to when an account has
// 2FA turned on. Mirrors src/lib/admin/session.ts's own
// createPendingTotp/consumePendingTotp/rate-limit pattern closely -
// same shape, just partitioned by each user's own email instead of a
// single shared "admin" partition, since there are many accounts here,
// not one.
import { getContainer } from "@/lib/cosmos";
import { getUserDoc } from "@/lib/tracker/userDoc";
import { encryptSecret, decryptSecret, generateToken, hashToken, encodeEmail } from "@/lib/auth/crypto";
import { generateTotpSecret, buildOtpAuthUri, verifyTotpCode, generateBackupCodes, hashBackupCode } from "@/lib/auth/totp";

const ENROLLMENT_PENDING_ID = "totp-enrollment-pending";
const ENROLLMENT_TTL_MS = 15 * 60 * 1000;
const LOGIN_PENDING_TTL_MS = 5 * 60 * 1000;

export async function isTwoFactorEnabled(email: string): Promise<boolean> {
  const user = await getUserDoc(email);
  return !!user?.totp?.enabled;
}

// Starts (or restarts - upsert, so a second attempt just replaces the
// first) enrollment. Deliberately doesn't touch the user doc yet - only
// confirmEnrollment below, once a real code has proven the secret was
// actually scanned/entered correctly, turns 2FA on for real. Without
// that confirmation step, a botched QR scan would silently brick the
// account's next login.
export async function startEnrollment(email: string): Promise<{ secret: string; otpauthUri: string }> {
  const container = getContainer();
  const secret = generateTotpSecret();
  await container.items.upsert({
    id: ENROLLMENT_PENDING_ID,
    pk: email,
    type: "totpEnrollmentPending",
    secretEncrypted: encryptSecret(secret),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS).toISOString(),
    ttl: Math.ceil(ENROLLMENT_TTL_MS / 1000),
  });
  return { secret, otpauthUri: buildOtpAuthUri(secret, email) };
}

export async function confirmEnrollment(email: string, code: string): Promise<{ ok: true; backupCodes: string[] } | { ok: false; error: string }> {
  const container = getContainer();
  let pending;
  try {
    const { resource } = await container.item(ENROLLMENT_PENDING_ID, email).read();
    pending = resource;
  } catch {
    pending = null;
  }
  if (!pending || pending.type !== "totpEnrollmentPending" || new Date(pending.expiresAt) < new Date()) {
    return { ok: false, error: "That code has expired - start setup again." };
  }

  const secret = decryptSecret(pending.secretEncrypted);
  if (!verifyTotpCode(secret, code)) {
    return { ok: false, error: "Incorrect code." };
  }

  const backupCodes = generateBackupCodes();
  const user = await getUserDoc(email);
  if (!user) return { ok: false, error: "No account found." };
  user.totp = {
    secretEncrypted: encryptSecret(secret),
    enabled: true,
    enrolledAt: new Date().toISOString(),
    backupCodeHashes: backupCodes.map(hashBackupCode),
  };
  await container.items.upsert(user);
  await container.item(ENROLLMENT_PENDING_ID, email).delete().catch(() => {});

  return { ok: true, backupCodes };
}

// Accepts either a live 6-digit code or a one-time backup code, burning
// the backup code on use - the same "lost your phone" recovery path
// also has to work for turning 2FA off cleanly, not just logging in.
async function verifyCodeOrBackup(email: string, code: string): Promise<boolean> {
  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user?.totp?.enabled) return false;

  if (/^\d{6}$/.test(code)) {
    return verifyTotpCode(decryptSecret(user.totp.secretEncrypted), code);
  }

  const hash = hashBackupCode(code);
  const index = user.totp.backupCodeHashes.indexOf(hash);
  if (index === -1) return false;

  user.totp.backupCodeHashes = user.totp.backupCodeHashes.filter((_, i) => i !== index);
  await container.items.upsert(user);
  return true;
}

export async function disableTwoFactor(email: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUserDoc(email);
  if (!user?.totp?.enabled) return { ok: false, error: "Two-factor authentication isn't turned on." };

  const valid = await verifyCodeOrBackup(email, code);
  if (!valid) return { ok: false, error: "Incorrect code." };

  const container = getContainer();
  delete user.totp;
  await container.items.upsert(user);
  return { ok: true };
}

// The hand-off between a verified magic-link click and a real session -
// verify/route.ts creates one of these instead of a session when the
// account has 2FA on, and the code-entry page below trades it in for
// the real thing once the right code (or a backup code) comes back.
// cookieValue mirrors the real session cookie's own
// `${encodeEmail(email)}.${raw}` shape (see auth/session.ts) so the
// login-verify route can recover the email without needing anything
// else from the request.
export async function createPendingLogin(email: string): Promise<{ cookieValue: string; maxAge: number }> {
  const container = getContainer();
  const { raw, hash } = generateToken();
  await container.items.create({
    id: hash,
    pk: email,
    type: "totpPendingLogin",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + LOGIN_PENDING_TTL_MS).toISOString(),
    ttl: Math.ceil(LOGIN_PENDING_TTL_MS / 1000),
  });
  return { cookieValue: `${encodeEmail(email)}.${raw}`, maxAge: Math.ceil(LOGIN_PENDING_TTL_MS / 1000) };
}

export async function consumePendingLogin(email: string, raw: string): Promise<boolean> {
  const container = getContainer();
  const hash = hashToken(raw);
  try {
    const { resource } = await container.item(hash, email).read();
    if (!resource || resource.type !== "totpPendingLogin" || new Date(resource.expiresAt) < new Date()) return false;
    await container.item(hash, email).delete();
    return true;
  } catch {
    return false;
  }
}

export async function verifyLoginCode(email: string, code: string): Promise<boolean> {
  return verifyCodeOrBackup(email, code);
}

// Same one-document-per-attempt, Cosmos-ttl-expired rate limit as
// src/lib/admin/session.ts's checkAdminLoginRateLimit/
// recordAdminLoginAttempt - partitioned per user's own email here,
// since (unlike the single shared admin account) a global cap would let
// one account's brute-force attempts count against every other user's
// budget too.
const ATTEMPT_WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS_PER_WINDOW = 10;

function attemptIdPrefix(kind: "login" | "enroll" | "disable"): string {
  return `totp-attempt:${kind}:`;
}

export async function checkTotpRateLimit(email: string, kind: "login" | "enroll" | "disable"): Promise<boolean> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string }>(
      {
        query: "SELECT c.id FROM c WHERE c.type = 'totpAttempt' AND STARTSWITH(c.id, @prefix)",
        parameters: [{ name: "@prefix", value: attemptIdPrefix(kind) }],
      },
      { partitionKey: email }
    )
    .fetchAll();
  return resources.length < MAX_ATTEMPTS_PER_WINDOW;
}

export async function recordTotpAttempt(email: string, kind: "login" | "enroll" | "disable"): Promise<void> {
  const container = getContainer();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await container.items.create({
    id: `${attemptIdPrefix(kind)}${suffix}`,
    pk: email,
    type: "totpAttempt",
    createdAt: new Date().toISOString(),
    ttl: ATTEMPT_WINDOW_SECONDS,
  });
}
