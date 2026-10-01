// Place at: tests/api/totp-disable-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  disableTwoFactor: vi.fn(),
  checkTotpRateLimit: vi.fn(),
  recordTotpAttempt: vi.fn(),
  removeAllTrustedDevices: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/auth/twoFactor", () => ({
  disableTwoFactor: mocks.disableTwoFactor,
  checkTotpRateLimit: mocks.checkTotpRateLimit,
  recordTotpAttempt: mocks.recordTotpAttempt,
}));

vi.mock("@/lib/auth/trustedDevice", () => ({ removeAllTrustedDevices: mocks.removeAllTrustedDevices }));

import { POST } from "@/app/api/auth/totp/disable/route";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/totp/disable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/totp/disable", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.checkTotpRateLimit.mockResolvedValue(true);
    mocks.removeAllTrustedDevices.mockResolvedValue(undefined);
  });

  it("rejects when not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(req({ code: "123456" }));
    expect(response.status).toBe(401);
    expect(mocks.disableTwoFactor).not.toHaveBeenCalled();
  });

  it("rejects when the rate limit has been hit", async () => {
    mocks.checkTotpRateLimit.mockResolvedValue(false);
    const response = await POST(req({ code: "123456" }));
    expect(response.status).toBe(429);
  });

  it("rejects a missing code", async () => {
    const response = await POST(req({}));
    expect(response.status).toBe(400);
    expect(mocks.disableTwoFactor).not.toHaveBeenCalled();
  });

  it("returns the real error and records a failed attempt on an incorrect code", async () => {
    mocks.disableTwoFactor.mockResolvedValue({ ok: false, error: "Incorrect code." });
    const response = await POST(req({ code: "000000" }));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe("Incorrect code.");
    expect(mocks.recordTotpAttempt).toHaveBeenCalledWith("rider@example.com", "disable");
    expect(mocks.removeAllTrustedDevices).not.toHaveBeenCalled();
  });

  it("turns 2FA off given a correct code, using only the server-side session email", async () => {
    mocks.disableTwoFactor.mockResolvedValue({ ok: true });
    const response = await POST(req({ code: "123456" }));
    const data = await response.json();
    expect(mocks.disableTwoFactor).toHaveBeenCalledWith("rider@example.com", "123456");
    expect(data).toEqual({ ok: true });
  });

  it("removes every phone trusted for the Vault, so turning 2FA back on never revives one", async () => {
    mocks.disableTwoFactor.mockResolvedValue({ ok: true });
    await POST(req({ code: "123456" }));
    expect(mocks.removeAllTrustedDevices).toHaveBeenCalledWith("rider@example.com");
  });
});
