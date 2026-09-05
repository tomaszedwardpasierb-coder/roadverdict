// Place at: tests/api/totp-enroll-start-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  startEnrollment: vi.fn(),
  checkTotpRateLimit: vi.fn(),
  recordTotpAttempt: vi.fn(),
  isTwoFactorEnabled: vi.fn(),
  toDataURL: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/auth/twoFactor", () => ({
  startEnrollment: mocks.startEnrollment,
  checkTotpRateLimit: mocks.checkTotpRateLimit,
  recordTotpAttempt: mocks.recordTotpAttempt,
  isTwoFactorEnabled: mocks.isTwoFactorEnabled,
}));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.toDataURL } }));

import { POST } from "@/app/api/auth/totp/enroll/start/route";

describe("POST /api/auth/totp/enroll/start", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.checkTotpRateLimit.mockResolvedValue(true);
    mocks.isTwoFactorEnabled.mockResolvedValue(false);
    mocks.startEnrollment.mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/RoadVerdict:rider%40example.com?secret=JBSWY3DPEHPK3PXP" });
    mocks.toDataURL.mockResolvedValue("data:image/png;base64,fake");
  });

  it("rejects when not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(401);
    expect(mocks.startEnrollment).not.toHaveBeenCalled();
  });

  it("rejects when the rate limit has been hit", async () => {
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.checkTotpRateLimit.mockResolvedValue(false);
    const response = await POST();
    expect(response.status).toBe(429);
    expect(mocks.startEnrollment).not.toHaveBeenCalled();
  });

  it("rejects when 2FA is already enabled on this account", async () => {
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.isTwoFactorEnabled.mockResolvedValue(true);
    const response = await POST();
    expect(response.status).toBe(409);
    expect(mocks.startEnrollment).not.toHaveBeenCalled();
  });

  it("returns a QR data URL built from the enrollment's otpauth URI, plus the manual-entry key", async () => {
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    const response = await POST();
    const data = await response.json();

    expect(mocks.startEnrollment).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.toDataURL).toHaveBeenCalledWith("otpauth://totp/RoadVerdict:rider%40example.com?secret=JBSWY3DPEHPK3PXP", expect.any(Object));
    expect(data).toEqual({ qrDataUrl: "data:image/png;base64,fake", manualEntryKey: "JBSWY3DPEHPK3PXP" });
  });
});
