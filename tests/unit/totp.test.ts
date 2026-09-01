import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOTP, Secret } from "otpauth";
import { verifyTotpCode } from "@/lib/admin/totp";

// Arbitrary valid base32 test secret (RFC 6238 style) - not a real credential.
const SECRET_BASE32 = "JBSWY3DPEHPK3PXP";
const PERIOD_MS = 30_000;

function codeFor(timestamp: number): string {
  const totp = new TOTP({ secret: Secret.fromBase32(SECRET_BASE32), digits: 6, period: 30 });
  return totp.generate({ timestamp });
}

const ORIGINAL_SECRET = process.env.ADMIN_TOTP_SECRET;

describe("verifyTotpCode", () => {
  beforeEach(() => {
    process.env.ADMIN_TOTP_SECRET = SECRET_BASE32;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_SECRET === undefined) delete process.env.ADMIN_TOTP_SECRET;
    else process.env.ADMIN_TOTP_SECRET = ORIGINAL_SECRET;
  });

  it("returns false when no ADMIN_TOTP_SECRET is configured", () => {
    delete process.env.ADMIN_TOTP_SECRET;
    expect(verifyTotpCode(codeFor(Date.now()))).toBe(false);
  });

  it("accepts the code for the current 30s period", () => {
    expect(verifyTotpCode(codeFor(Date.now()))).toBe(true);
  });

  it("rejects a wrong code", () => {
    const correct = codeFor(Date.now());
    const wrong = correct === "000000" ? "111111" : "000000";
    expect(verifyTotpCode(wrong)).toBe(false);
  });

  it("rejects a non-numeric / malformed code", () => {
    expect(verifyTotpCode("abcdef")).toBe(false);
  });

  // window: 1 in the source means +/- one 30s period of clock-skew
  // tolerance either side of "now".
  it("accepts a code from one period earlier (clock-skew tolerance)", () => {
    expect(verifyTotpCode(codeFor(Date.now() - PERIOD_MS))).toBe(true);
  });

  it("accepts a code from one period later (clock-skew tolerance)", () => {
    expect(verifyTotpCode(codeFor(Date.now() + PERIOD_MS))).toBe(true);
  });

  it("rejects a code from two periods earlier, outside the +/-1 window", () => {
    expect(verifyTotpCode(codeFor(Date.now() - 2 * PERIOD_MS))).toBe(false);
  });

  it("rejects a code from two periods later, outside the +/-1 window", () => {
    expect(verifyTotpCode(codeFor(Date.now() + 2 * PERIOD_MS))).toBe(false);
  });

  it("rejects a valid code for a different secret", () => {
    const otherTotp = new TOTP({ secret: new Secret({ size: 20 }), digits: 6, period: 30 });
    const codeFromOtherSecret = otherTotp.generate({ timestamp: Date.now() });
    expect(verifyTotpCode(codeFromOtherSecret)).toBe(false);
  });
});
