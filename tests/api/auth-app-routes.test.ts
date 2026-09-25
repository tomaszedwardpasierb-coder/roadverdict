import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isAccountBlocked: vi.fn(),
  isIpRateLimited: vi.fn(),
  recordIpAttempt: vi.fn(),
  createAppLoginCode: vi.fn(),
  isAppCodeRequestCoolingDown: vi.fn(),
  consumeAppLoginCode: vi.fn(),
  isAppCodeGuessingLocked: vi.fn(),
  sendAppLoginCodeEmail: vi.fn(),
  isTwoFactorEnabled: vi.fn(),
  createPendingLogin: vi.fn(),
  isPendingLoginValid: vi.fn(),
  consumePendingLogin: vi.fn(),
  verifyLoginCode: vi.fn(),
  checkTotpRateLimit: vi.fn(),
  recordTotpAttempt: vi.fn(),
  createSessionForEmail: vi.fn(),
}));

vi.mock("@/lib/tracker/userDoc", () => ({ isAccountBlocked: mocks.isAccountBlocked }));
vi.mock("@/lib/auth/signInRateLimit", () => ({
  getClientIp: () => "1.2.3.4",
  isIpRateLimited: mocks.isIpRateLimited,
  recordIpAttempt: mocks.recordIpAttempt,
}));
vi.mock("@/lib/auth/appLoginCode", () => ({
  createAppLoginCode: mocks.createAppLoginCode,
  isAppCodeRequestCoolingDown: mocks.isAppCodeRequestCoolingDown,
  consumeAppLoginCode: mocks.consumeAppLoginCode,
  isAppCodeGuessingLocked: mocks.isAppCodeGuessingLocked,
}));
vi.mock("@/lib/resend", () => ({ sendAppLoginCodeEmail: mocks.sendAppLoginCodeEmail }));
vi.mock("@/lib/auth/twoFactor", () => ({
  isTwoFactorEnabled: mocks.isTwoFactorEnabled,
  createPendingLogin: mocks.createPendingLogin,
  isPendingLoginValid: mocks.isPendingLoginValid,
  consumePendingLogin: mocks.consumePendingLogin,
  verifyLoginCode: mocks.verifyLoginCode,
  checkTotpRateLimit: mocks.checkTotpRateLimit,
  recordTotpAttempt: mocks.recordTotpAttempt,
}));
vi.mock("@/lib/auth/session", () => ({ createSessionForEmail: mocks.createSessionForEmail }));

import { POST as requestCode } from "@/app/api/auth/app/request-code/route";
import { POST as verifyCode } from "@/app/api/auth/app/verify-code/route";
import { POST as verify2fa } from "@/app/api/auth/app/verify-2fa/route";
import { encodeEmail } from "@/lib/auth/crypto";

function req(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.isAccountBlocked.mockResolvedValue(false);
  mocks.isIpRateLimited.mockResolvedValue(false);
  mocks.recordIpAttempt.mockResolvedValue(undefined);
  mocks.isAppCodeRequestCoolingDown.mockResolvedValue(false);
  mocks.createAppLoginCode.mockResolvedValue("482913");
  mocks.sendAppLoginCodeEmail.mockResolvedValue(undefined);
  mocks.isAppCodeGuessingLocked.mockResolvedValue(false);
  mocks.consumeAppLoginCode.mockResolvedValue("ok");
  mocks.isTwoFactorEnabled.mockResolvedValue(false);
  mocks.createPendingLogin.mockResolvedValue({ cookieValue: "pending.value", maxAge: 300 });
  mocks.isPendingLoginValid.mockResolvedValue(true);
  mocks.consumePendingLogin.mockResolvedValue(true);
  mocks.verifyLoginCode.mockResolvedValue(true);
  mocks.checkTotpRateLimit.mockResolvedValue(true);
  mocks.recordTotpAttempt.mockResolvedValue(undefined);
  mocks.createSessionForEmail.mockResolvedValue({ cookieValue: "enc.session-token", maxAge: 7776000 });
});

describe("POST /api/auth/app/request-code", () => {
  const path = "/api/auth/app/request-code";

  it("emails a code to the normalised address", async () => {
    const res = await requestCode(req(path, { email: "  Rider@Example.com " }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.createAppLoginCode).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.sendAppLoginCodeEmail).toHaveBeenCalledWith("rider@example.com", "482913");
  });

  it("rejects a missing or malformed email", async () => {
    expect((await requestCode(req(path, {}))).status).toBe(400);
    expect((await requestCode(req(path, { email: "nope" }))).status).toBe(400);
    expect((await requestCode(req(path, "not json"))).status).toBe(400);
    expect(mocks.sendAppLoginCodeEmail).not.toHaveBeenCalled();
  });

  it("refuses a blocked account", async () => {
    mocks.isAccountBlocked.mockResolvedValue(true);
    expect((await requestCode(req(path, { email: "rider@example.com" }))).status).toBe(403);
    expect(mocks.createAppLoginCode).not.toHaveBeenCalled();
  });

  it("shares the per-IP ceiling with magic links", async () => {
    mocks.isIpRateLimited.mockResolvedValue(true);
    expect((await requestCode(req(path, { email: "rider@example.com" }))).status).toBe(429);
    expect(mocks.createAppLoginCode).not.toHaveBeenCalled();
  });

  it("allows one code a minute per account", async () => {
    mocks.isAppCodeRequestCoolingDown.mockResolvedValue(true);
    expect((await requestCode(req(path, { email: "rider@example.com" }))).status).toBe(429);
    expect(mocks.createAppLoginCode).not.toHaveBeenCalled();
  });

  it("gives the demo address the ordinary reply without creating or sending a code", async () => {
    const res = await requestCode(req(path, { email: "demo@roadverdict.co.uk" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.createAppLoginCode).not.toHaveBeenCalled();
    expect(mocks.sendAppLoginCodeEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/app/verify-code", () => {
  const path = "/api/auth/app/verify-code";

  it("trades a right code for a 90-day app session token", async () => {
    const res = await verifyCode(req(path, { email: "Rider@example.com", code: "482913" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ token: "enc.session-token", expiresInSeconds: 7776000 });
    expect(mocks.consumeAppLoginCode).toHaveBeenCalledWith("rider@example.com", "482913");
    expect(mocks.createSessionForEmail).toHaveBeenCalledWith("rider@example.com", "1.2.3.4", "unknown", { client: "app" });
  });

  it("rejects anything that isn't six digits without touching the stored code", async () => {
    expect((await verifyCode(req(path, { email: "rider@example.com", code: "12345" }))).status).toBe(400);
    expect((await verifyCode(req(path, { email: "rider@example.com", code: "abcdef" }))).status).toBe(400);
    expect((await verifyCode(req(path, { code: "123456" }))).status).toBe(400);
    expect(mocks.consumeAppLoginCode).not.toHaveBeenCalled();
  });

  it("says a wrong code is incorrect and creates no session", async () => {
    mocks.consumeAppLoginCode.mockResolvedValue("invalid");
    const res = await verifyCode(req(path, { email: "rider@example.com", code: "000000" }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Incorrect code." });
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("asks for a new code when the old one can't be used", async () => {
    mocks.consumeAppLoginCode.mockResolvedValue("expired");
    const res = await verifyCode(req(path, { email: "rider@example.com", code: "482913" }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "That code has expired - request a new one." });
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("stops checking codes once the account has too many wrong guesses", async () => {
    mocks.isAppCodeGuessingLocked.mockResolvedValue(true);
    expect((await verifyCode(req(path, { email: "rider@example.com", code: "482913" }))).status).toBe(429);
    expect(mocks.consumeAppLoginCode).not.toHaveBeenCalled();
  });

  it("refuses an account blocked while its code was live", async () => {
    mocks.isAccountBlocked.mockResolvedValue(true);
    expect((await verifyCode(req(path, { email: "rider@example.com", code: "482913" }))).status).toBe(403);
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("hands back a pending token instead of a session when 2FA is on", async () => {
    mocks.isTwoFactorEnabled.mockResolvedValue(true);
    const res = await verifyCode(req(path, { email: "rider@example.com", code: "482913" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ twoFactorRequired: true, pendingToken: "pending.value", expiresInSeconds: 300 });
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/app/verify-2fa", () => {
  const path = "/api/auth/app/verify-2fa";
  const pendingToken = `${encodeEmail("rider@example.com")}.pending-raw`;

  it("trades a valid pending token and authenticator code for an app session", async () => {
    const res = await verify2fa(req(path, { pendingToken, code: "123456" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ token: "enc.session-token", expiresInSeconds: 7776000 });
    expect(mocks.verifyLoginCode).toHaveBeenCalledWith("rider@example.com", "123456");
    expect(mocks.consumePendingLogin).toHaveBeenCalledWith("rider@example.com", "pending-raw");
    expect(mocks.createSessionForEmail).toHaveBeenCalledWith("rider@example.com", "1.2.3.4", "unknown", { client: "app" });
  });

  it("checks the pending login before looking at any code", async () => {
    mocks.isPendingLoginValid.mockResolvedValue(false);
    const res = await verify2fa(req(path, { pendingToken, code: "123456" }));
    expect(res.status).toBe(401);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed pending token", async () => {
    expect((await verify2fa(req(path, { code: "123456" }))).status).toBe(401);
    expect((await verify2fa(req(path, { pendingToken: "no-dot", code: "123456" }))).status).toBe(401);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("records a wrong code and keeps the pending login for another try", async () => {
    mocks.verifyLoginCode.mockResolvedValue(false);
    const res = await verify2fa(req(path, { pendingToken, code: "000000" }));
    expect(res.status).toBe(401);
    expect(mocks.recordTotpAttempt).toHaveBeenCalledWith("rider@example.com", "login");
    expect(mocks.consumePendingLogin).not.toHaveBeenCalled();
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("shares the web's 2FA rate limit", async () => {
    mocks.checkTotpRateLimit.mockResolvedValue(false);
    expect((await verify2fa(req(path, { pendingToken, code: "123456" }))).status).toBe(429);
    expect(mocks.verifyLoginCode).not.toHaveBeenCalled();
  });

  it("creates no session if the pending login was used up in the meantime", async () => {
    mocks.consumePendingLogin.mockResolvedValue(false);
    expect((await verify2fa(req(path, { pendingToken, code: "123456" }))).status).toBe(401);
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });
});
