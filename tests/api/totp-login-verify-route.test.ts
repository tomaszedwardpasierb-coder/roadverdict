// Place at: tests/api/totp-login-verify-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  consumePendingLogin: vi.fn(),
  verifyLoginCode: vi.fn(),
  checkTotpRateLimit: vi.fn(),
  recordTotpAttempt: vi.fn(),
  createSessionForEmail: vi.fn(),
}));

vi.mock("@/lib/auth/twoFactor", () => ({
  consumePendingLogin: mocks.consumePendingLogin,
  verifyLoginCode: mocks.verifyLoginCode,
  checkTotpRateLimit: mocks.checkTotpRateLimit,
  recordTotpAttempt: mocks.recordTotpAttempt,
}));
vi.mock("@/lib/auth/session", () => ({ createSessionForEmail: mocks.createSessionForEmail }));
// decodeEmail/encodeEmail (auth/crypto) deliberately NOT mocked - pure,
// deterministic, and this file needs the real round-trip to build a
// realistic pending cookie value.

import { POST } from "@/app/api/auth/totp/login-verify/route";
import { encodeEmail } from "@/lib/auth/crypto";

const EMAIL = "rider@example.com";

function req(body: unknown, pendingCookie?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (pendingCookie) headers["cookie"] = `totp_pending=${pendingCookie}`;
  return new NextRequest("http://localhost/api/auth/totp/login-verify", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function pendingCookieValue(email = EMAIL, raw = "raw-pending-token") {
  return `${encodeEmail(email)}.${raw}`;
}

describe("POST /api/auth/totp/login-verify", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.checkTotpRateLimit.mockResolvedValue(true);
    mocks.verifyLoginCode.mockResolvedValue(true);
    mocks.consumePendingLogin.mockResolvedValue(true);
    mocks.createSessionForEmail.mockResolvedValue({ cookieValue: "real-session-cookie", maxAge: 123 });
  });

  it("rejects when there's no pending cookie at all", async () => {
    const response = await POST(req({ code: "123456" }));
    expect(response.status).toBe(401);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("rejects a malformed pending cookie (no raw token half)", async () => {
    const response = await POST(req({ code: "123456" }, encodeEmail(EMAIL)));
    expect(response.status).toBe(401);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("rejects when the rate limit for this account has been hit", async () => {
    mocks.checkTotpRateLimit.mockResolvedValue(false);
    const response = await POST(req({ code: "123456" }, pendingCookieValue()));
    expect(response.status).toBe(429);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("rejects a missing code", async () => {
    const response = await POST(req({}, pendingCookieValue()));
    expect(response.status).toBe(400);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("records a failed attempt and does not create a session on an incorrect code, without burning the pending login", async () => {
    mocks.verifyLoginCode.mockResolvedValue(false);
    const response = await POST(req({ code: "000000" }, pendingCookieValue()));
    expect(response.status).toBe(401);
    expect(mocks.recordTotpAttempt).toHaveBeenCalledWith(EMAIL, "login");
    expect(mocks.consumePendingLogin).not.toHaveBeenCalled();
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("rejects when the pending login itself has expired or was already used, even with a correct code", async () => {
    mocks.consumePendingLogin.mockResolvedValue(false);
    const response = await POST(req({ code: "123456" }, pendingCookieValue()));
    expect(response.status).toBe(401);
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("verifies the code against the email decoded from the pending cookie, not anything client-supplied", async () => {
    await POST(req({ code: "123456" }, pendingCookieValue("someone-else@example.com")));
    expect(mocks.verifyLoginCode).toHaveBeenCalledWith("someone-else@example.com", "123456");
  });

  it("creates a real session and clears the pending cookie on success", async () => {
    const response = await POST(req({ code: "123456" }, pendingCookieValue()));
    const data = await response.json();

    expect(data).toEqual({ ok: true });
    expect(mocks.createSessionForEmail).toHaveBeenCalledWith(EMAIL, "unknown", "unknown");

    const sessionCookie = response.cookies.get("session");
    expect(sessionCookie?.value).toBe("real-session-cookie");
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.secure).toBe(true);

    const pendingCookie = response.cookies.get("totp_pending");
    expect(pendingCookie?.value).toBe("");
  });
});
