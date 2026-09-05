// Place at: tests/unit/authTotp.test.ts
//
// Pure TOTP math for regular user accounts (src/lib/auth/totp.ts) -
// distinct from src/lib/admin/totp.ts (single hardcoded secret, see
// tests/unit/totp.test.ts), since this generates and verifies a
// per-account secret. Exercised for real against the otpauth library,
// same convention as the admin version's own test file.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOTP, Secret } from "otpauth";
import { generateTotpSecret, buildOtpAuthUri, verifyTotpCode, generateBackupCodes, hashBackupCode } from "@/lib/auth/totp";

const SECRET_BASE32 = "JBSWY3DPEHPK3PXP";
const PERIOD_MS = 30_000;

function codeFor(secretBase32: string, timestamp: number): string {
  const totp = new TOTP({ secret: Secret.fromBase32(secretBase32), digits: 6, period: 30 });
  return totp.generate({ timestamp });
}

describe("generateTotpSecret", () => {
  it("returns a base32 string decodable by the otpauth library", () => {
    const secret = generateTotpSecret();
    expect(() => Secret.fromBase32(secret)).not.toThrow();
  });

  it("never generates the same secret twice across many calls", () => {
    const secrets = new Set(Array.from({ length: 50 }, () => generateTotpSecret()));
    expect(secrets.size).toBe(50);
  });
});

describe("buildOtpAuthUri", () => {
  it("builds an otpauth:// URI carrying the RoadVerdict issuer and the account email as the label", () => {
    const uri = buildOtpAuthUri(SECRET_BASE32, "rider@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(decodeURIComponent(uri)).toContain("RoadVerdict");
    expect(decodeURIComponent(uri)).toContain("rider@example.com");
  });

  it("embeds the same secret a real authenticator app would need to generate matching codes", () => {
    const uri = buildOtpAuthUri(SECRET_BASE32, "rider@example.com");
    expect(uri).toContain(`secret=${SECRET_BASE32}`);
  });
});

describe("verifyTotpCode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts the code for the current 30s period", () => {
    expect(verifyTotpCode(SECRET_BASE32, codeFor(SECRET_BASE32, Date.now()))).toBe(true);
  });

  it("rejects a wrong code", () => {
    const correct = codeFor(SECRET_BASE32, Date.now());
    const wrong = correct === "000000" ? "111111" : "000000";
    expect(verifyTotpCode(SECRET_BASE32, wrong)).toBe(false);
  });

  it("rejects a non-numeric / malformed code without throwing", () => {
    expect(verifyTotpCode(SECRET_BASE32, "abcdef")).toBe(false);
    expect(verifyTotpCode(SECRET_BASE32, "12345")).toBe(false);
    expect(verifyTotpCode(SECRET_BASE32, "1234567")).toBe(false);
  });

  it("accepts a code from one period earlier or later (clock-skew tolerance)", () => {
    expect(verifyTotpCode(SECRET_BASE32, codeFor(SECRET_BASE32, Date.now() - PERIOD_MS))).toBe(true);
    expect(verifyTotpCode(SECRET_BASE32, codeFor(SECRET_BASE32, Date.now() + PERIOD_MS))).toBe(true);
  });

  it("rejects a code two periods outside the window", () => {
    expect(verifyTotpCode(SECRET_BASE32, codeFor(SECRET_BASE32, Date.now() - 2 * PERIOD_MS))).toBe(false);
    expect(verifyTotpCode(SECRET_BASE32, codeFor(SECRET_BASE32, Date.now() + 2 * PERIOD_MS))).toBe(false);
  });

  it("rejects a valid code generated against a different account's secret", () => {
    const otherSecret = generateTotpSecret();
    const codeFromOtherSecret = codeFor(otherSecret, Date.now());
    expect(verifyTotpCode(SECRET_BASE32, codeFromOtherSecret)).toBe(false);
  });
});

describe("generateBackupCodes", () => {
  it("generates 8 codes by default", () => {
    expect(generateBackupCodes()).toHaveLength(8);
  });

  it("generates the requested count", () => {
    expect(generateBackupCodes(3)).toHaveLength(3);
  });

  it("never generates a duplicate within one batch or across batches", () => {
    const all = [...generateBackupCodes(50), ...generateBackupCodes(50)];
    expect(new Set(all).size).toBe(100);
  });

  it("generates lowercase-hex-only codes", () => {
    for (const code of generateBackupCodes()) {
      expect(code).toMatch(/^[0-9a-f]{10}$/);
    }
  });
});

describe("hashBackupCode", () => {
  it("is deterministic for the same code", () => {
    expect(hashBackupCode("abcd1234ef")).toBe(hashBackupCode("abcd1234ef"));
  });

  it("is case- and whitespace-insensitive, so a copy-pasted or re-typed code still matches", () => {
    expect(hashBackupCode("ABCD1234EF")).toBe(hashBackupCode("abcd1234ef"));
    expect(hashBackupCode("  abcd1234ef  ")).toBe(hashBackupCode("abcd1234ef"));
  });

  it("produces different hashes for different codes", () => {
    expect(hashBackupCode("abcd1234ef")).not.toBe(hashBackupCode("ffffffffff"));
  });

  it("returns a 64-character lowercase hex SHA-256 hash", () => {
    expect(hashBackupCode("abcd1234ef")).toMatch(/^[0-9a-f]{64}$/);
  });
});
