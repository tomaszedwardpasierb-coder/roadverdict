// Place at: src/lib/tracker/vaultSession.ts
//
// The Vault's "re-authenticate to open, auto-lock after 10 minutes of
// inactivity" session, mirroring twoFactor.ts's own
// createPendingLogin/isPendingLoginValid/consumePendingLogin shape
// (opaque random token, only its SHA-256 hash stored in Cosmos, cookie
// value `${encodeEmail(email)}.${raw}`) - this codebase has no JWT
// dependency and every other "prove you're allowed to do this, for a
// limited window" feature already uses this exact mechanism, so the
// Vault reuses it rather than introducing one.
//
// Unlike a pending login (a flat, one-shot 5-minute window, consumed on
// first use), the Vault's session is long-lived-but-sliding: it isn't
// deleted after one successful check, and extendVaultSession pushes its
// expiry forward again on every request that actually serves real vault
// content. That's what turns a flat "expires 10 minutes after unlock"
// into "expires 10 minutes after the LAST real interaction" - the
// spec's actual auto-lock requirement. If nothing ever calls
// extendVaultSession again (the tab was left open with no further
// activity), the original expiresAt simply passes and the next request
// fails isVaultSessionValid, which is the real enforcement point - the
// client's own inactivity timer is a visible convenience, not this.
import type { NextRequest } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { generateToken, hashToken, encodeEmail, decodeEmail } from "@/lib/auth/crypto";

const VAULT_SESSION_TTL_MS = 10 * 60 * 1000;
export const VAULT_SESSION_COOKIE_NAME = "vault_session";
export const VAULT_SESSION_MAX_AGE_SECONDS = Math.ceil(VAULT_SESSION_TTL_MS / 1000);

export async function createVaultSession(email: string): Promise<{ cookieValue: string; maxAge: number }> {
  const container = getContainer();
  const { raw, hash } = generateToken();
  await container.items.create({
    id: hash,
    pk: email,
    type: "vaultSession",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + VAULT_SESSION_TTL_MS).toISOString(),
    ttl: VAULT_SESSION_MAX_AGE_SECONDS,
  });
  return { cookieValue: `${encodeEmail(email)}.${raw}`, maxAge: VAULT_SESSION_MAX_AGE_SECONDS };
}

export async function isVaultSessionValid(email: string, raw: string): Promise<boolean> {
  const container = getContainer();
  const hash = hashToken(raw);
  try {
    const { resource } = await container.item(hash, email).read();
    return !!resource && resource.type === "vaultSession" && new Date(resource.expiresAt) >= new Date();
  } catch {
    return false;
  }
}

export async function extendVaultSession(email: string, raw: string): Promise<void> {
  const container = getContainer();
  const hash = hashToken(raw);
  try {
    const { resource } = await container.item(hash, email).read();
    if (!resource || resource.type !== "vaultSession") return;
    resource.expiresAt = new Date(Date.now() + VAULT_SESSION_TTL_MS).toISOString();
    await container.items.upsert(resource);
  } catch {
    // Best-effort - a failed extend just means this session expires on
    // its previous schedule instead of sliding forward, never a hard
    // failure for whatever real request triggered the extend attempt.
  }
}

export async function clearVaultSession(email: string, raw: string): Promise<void> {
  const container = getContainer();
  const hash = hashToken(raw);
  try {
    await container.item(hash, email).delete();
  } catch {
    // Already gone (expired or never existed) - nothing to do.
  }
}

// Shared by every Vault route that needs to check "is this request
// currently unlocked" - reads the cookie the same way login-verify's
// route reads totp_pending (request.cookies, not next/headers' cookies(),
// since every Vault route is a plain NextRequest/NextResponse handler),
// confirms it actually names the caller's own already-authenticated
// session email (not just any account someone could construct, since
// the cookie's email portion is only obfuscated, never signed - see
// decodeEmail's own comment in crypto.ts), then checks it against Cosmos.
// Returns the raw token (needed afterward to extend or clear the
// session) rather than a bare boolean, so callers don't have to
// re-parse the cookie a second time.
export async function resolveVaultUnlock(request: NextRequest, email: string): Promise<string | null> {
  const cookieValue = request.cookies.get(VAULT_SESSION_COOKIE_NAME)?.value;
  if (!cookieValue) return null;
  const [encodedEmail, raw] = cookieValue.split(".");
  if (!encodedEmail || !raw) return null;
  if (decodeEmail(encodedEmail) !== email) return null;
  const valid = await isVaultSessionValid(email, raw);
  return valid ? raw : null;
}
