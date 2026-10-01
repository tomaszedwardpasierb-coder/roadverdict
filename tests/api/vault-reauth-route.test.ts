// Place at: tests/api/vault-reauth-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isPro: vi.fn(),
  isTwoFactorEnabled: vi.fn(),
  verifyLoginCode: vi.fn(),
  checkTotpRateLimit: vi.fn(),
  recordTotpAttempt: vi.fn(),
  createVaultSession: vi.fn(),
  recordVaultAccess: vi.fn(),
  lookupCountry: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.getSession,
  parseBearerToken: (value: string | null | undefined) => (value && /^Bearer\s+\S+$/i.test(value.trim()) ? value.trim().split(/\s+/)[1] : null),
}));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));
vi.mock("@/lib/auth/twoFactor", () => ({
  isTwoFactorEnabled: mocks.isTwoFactorEnabled,
  verifyLoginCode: mocks.verifyLoginCode,
  checkTotpRateLimit: mocks.checkTotpRateLimit,
  recordTotpAttempt: mocks.recordTotpAttempt,
}));
vi.mock("@/lib/tracker/vaultSession", () => ({
  createVaultSession: mocks.createVaultSession,
  VAULT_SESSION_COOKIE_NAME: "vault_session",
}));
vi.mock("@/lib/tracker/vaultAudit", () => ({
  detectBrowser: (ua: string) => (ua.includes("Chrome") ? "Chrome" : "Unknown browser"),
  lookupCountry: mocks.lookupCountry,
  recordVaultAccess: mocks.recordVaultAccess,
}));

import { POST } from "@/app/api/vault/reauth/route";

const EMAIL = "rider@example.com";

function req(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/vault/reauth", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Chrome test agent", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/vault/reauth", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSession.mockResolvedValue({ email: EMAIL });
    mocks.isPro.mockResolvedValue(true);
    mocks.isTwoFactorEnabled.mockResolvedValue(true);
    mocks.checkTotpRateLimit.mockResolvedValue(true);
    mocks.verifyLoginCode.mockResolvedValue(true);
    mocks.lookupCountry.mockResolvedValue("United Kingdom");
    mocks.recordVaultAccess.mockResolvedValue({ at: "2026-01-01T00:00:00.000Z", browser: "Firefox", country: "France" });
    mocks.createVaultSession.mockResolvedValue({ cookieValue: "cookie-value", maxAge: 600 });
  });

  it("rejects when not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(req({ code: "123456" }));
    expect(response.status).toBe(401);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("rejects a free (non-Pro) account", async () => {
    mocks.isPro.mockResolvedValue(false);
    const response = await POST(req({ code: "123456" }));
    expect(response.status).toBe(403);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("rejects an account without 2FA enabled", async () => {
    mocks.isTwoFactorEnabled.mockResolvedValue(false);
    const response = await POST(req({ code: "123456" }));
    expect(response.status).toBe(403);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("rejects when the rate limit is exhausted", async () => {
    mocks.checkTotpRateLimit.mockResolvedValue(false);
    const response = await POST(req({ code: "123456" }));
    expect(response.status).toBe(429);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("rejects a missing code with 400", async () => {
    const response = await POST(req({}));
    expect(response.status).toBe(400);
  });

  it("records a failed attempt and rejects an incorrect code, without creating a vault session", async () => {
    mocks.verifyLoginCode.mockResolvedValue(false);
    const response = await POST(req({ code: "000000" }));
    expect(response.status).toBe(401);
    expect(mocks.recordTotpAttempt).toHaveBeenCalledWith(EMAIL, "vault");
    expect(mocks.createVaultSession).not.toHaveBeenCalled();
  });

  it("on a correct code, creates a vault session, sets the cookie, and returns the previous access event", async () => {
    const response = await POST(req({ code: "123456" }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.previousAccess).toEqual({ at: "2026-01-01T00:00:00.000Z", browser: "Firefox", country: "France" });

    const setCookie = response.cookies.get("vault_session");
    expect(setCookie?.value).toBe("cookie-value");

    expect(mocks.recordVaultAccess).toHaveBeenCalledWith(EMAIL, { browser: "Chrome", country: "United Kingdom" });
  });

  it("gives the Android app its unlock token (it has no cookie jar), recorded as the app", async () => {
    const res = await POST(req({ code: "123456" }, { authorization: "Bearer app-session-token", "user-agent": "okhttp/4.12.0" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.vaultToken).toBe("cookie-value");
    expect(data.expiresInSeconds).toBe(600);
    expect(mocks.recordVaultAccess).toHaveBeenCalledWith(EMAIL, expect.objectContaining({ browser: "RoadVerdict Android app" }));
  });

  it("never puts the unlock token in the website's reply - its cookie stays out of the page's reach", async () => {
    const res = await POST(req({ code: "123456" }));
    const data = await res.json();
    expect(data.vaultToken).toBeUndefined();
    expect(res.cookies.get("vault_session")?.value).toBe("cookie-value");
  });

  it("gives the app nothing when the code is wrong", async () => {
    mocks.verifyLoginCode.mockResolvedValue(false);
    const res = await POST(req({ code: "000000" }, { authorization: "Bearer app-session-token" }));
    expect(res.status).toBe(401);
    expect((await res.json()).vaultToken).toBeUndefined();
  });
});
