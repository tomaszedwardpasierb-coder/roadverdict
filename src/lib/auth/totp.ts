// Place at: src/lib/auth/totp.ts
//
// Pure TOTP math for regular user accounts - no Cosmos I/O here, that
// lives in twoFactor.ts. Deliberately separate from src/lib/admin/totp.ts:
// the admin version checks one hardcoded secret from an env var (there's
// only ever one admin), this generates and verifies a distinct secret
// per user account.
import { TOTP, Secret } from "otpauth";
import { randomBytes, createHash } from "crypto";

const ISSUER = "RoadVerdict";

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function buildTotp(secretBase32: string, email: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

// The otpauth:// URI an authenticator app reads when it scans the QR
// code - carries the issuer/label/algorithm/digits/period alongside the
// secret, so the app never needs any of those typed in manually.
export function buildOtpAuthUri(secretBase32: string, email: string): string {
  return buildTotp(secretBase32, email).toString();
}

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  // window: 1 tolerates the code either side of "now" - a person's phone
  // clock and this server's clock are never perfectly in sync, and a
  // 30-second period is unforgiving of even a few seconds of drift.
  return buildTotp(secretBase32, "").validate({ token: code, window: 1 }) !== null;
}

// Shown once, at enrollment, as the fallback for "I lost my phone" -
// without these, losing the authenticator app permanently locks the
// account out of itself. 10 hex characters each (5 random bytes) - short
// enough to type by hand, long enough that guessing one isn't realistic
// even without a rate limit.
export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => randomBytes(5).toString("hex"));
}

// Only the hash is ever stored, same principle as hashToken in crypto.ts -
// a backup code is a bearer secret, not something that needs to be read
// back in plaintext once issued.
export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.toLowerCase().trim()).digest("hex");
}
