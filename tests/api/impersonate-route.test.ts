import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  verifyAdminPassword: vi.fn(),
  checkAdminLoginRateLimit: vi.fn(),
  recordAdminLoginAttempt: vi.fn(),
  verifyTotpCode: vi.fn(),
  createSessionForEmail: vi.fn(),
  userExists: vi.fn(),
  logImpersonation: vi.fn(),
  newImpersonationSessionId: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({
  getAdminSession: mocks.getAdminSession,
  verifyAdminPassword: mocks.verifyAdminPassword,
  checkAdminLoginRateLimit: mocks.checkAdminLoginRateLimit,
  recordAdminLoginAttempt: mocks.recordAdminLoginAttempt,
}));
vi.mock("@/lib/admin/totp", () => ({ verifyTotpCode: mocks.verifyTotpCode }));
// createSessionForEmail is the same helper the real sign-in flow uses -
// its own internals (user doc bootstrap, session doc shape) aren't
// this route's concern, so it's mocked here.
vi.mock("@/lib/auth/session", () => ({ createSessionForEmail: mocks.createSessionForEmail }));
vi.mock("@/lib/admin/impersonation", () => ({
  userExists: mocks.userExists,
  logImpersonation: mocks.logImpersonation,
  newImpersonationSessionId: mocks.newImpersonationSessionId,
}));

import { POST, DELETE } from "@/app/api/tomasz/impersonate/route";

const validBody = { email: "rider@example.com", password: "correct-password", totpCode: "123456", reason: "checking a support ticket" };

function postRequest(body: unknown, opts?: { cookie?: string; forwardedFor?: string }): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts?.cookie) headers.cookie = opts.cookie;
  if (opts?.forwardedFor) headers["x-forwarded-for"] = opts.forwardedFor;
  return new NextRequest("http://localhost/api/tomasz/impersonate", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deleteRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new NextRequest("http://localhost/api/tomasz/impersonate", { method: "DELETE", headers });
}

describe("POST /api/tomasz/impersonate", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.checkAdminLoginRateLimit.mockResolvedValue({ allowed: true });
    mocks.recordAdminLoginAttempt.mockResolvedValue(undefined);
    mocks.verifyAdminPassword.mockReturnValue(true);
    mocks.verifyTotpCode.mockReturnValue(true);
    mocks.userExists.mockResolvedValue(true);
    mocks.logImpersonation.mockResolvedValue(undefined);
    mocks.newImpersonationSessionId.mockReturnValue("session-abc");
    mocks.createSessionForEmail.mockResolvedValue({ cookieValue: "target-session-cookie", maxAge: 12345 });
  });

  it("rejects a non-admin request outright, without ever checking the password or looking up the target account", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(postRequest(validBody));
    expect(response.status).toBe(401);
    expect(mocks.verifyAdminPassword).not.toHaveBeenCalled();
    expect(mocks.userExists).not.toHaveBeenCalled();
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(postRequest("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a missing or blank email", async () => {
    const response = await POST(postRequest({ ...validBody, email: "   " }));
    expect(response.status).toBe(400);
    expect(mocks.userExists).not.toHaveBeenCalled();
  });

  it("rejects a missing or blank reason, before any re-auth check runs", async () => {
    const response = await POST(postRequest({ ...validBody, reason: "   " }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please give a reason for this impersonation." });
    expect(mocks.verifyAdminPassword).not.toHaveBeenCalled();
  });

  // Step-up re-auth: an already-valid admin session is no longer
  // sufficient on its own to start impersonating.
  describe("step-up re-auth", () => {
    it("rejects when the password re-auth rate limit is exceeded", async () => {
      mocks.checkAdminLoginRateLimit.mockImplementation(async (kind: string) => ({ allowed: kind !== "reauth-password" }));
      const response = await POST(postRequest(validBody));
      expect(response.status).toBe(429);
      expect(mocks.verifyAdminPassword).not.toHaveBeenCalled();
    });

    it("rejects an incorrect password, without ever checking the TOTP code", async () => {
      mocks.verifyAdminPassword.mockReturnValue(false);
      const response = await POST(postRequest(validBody));
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Incorrect password." });
      expect(mocks.recordAdminLoginAttempt).toHaveBeenCalledWith("reauth-password");
      expect(mocks.verifyTotpCode).not.toHaveBeenCalled();
      expect(mocks.userExists).not.toHaveBeenCalled();
    });

    it("rejects a missing password", async () => {
      const { password: _password, ...withoutPassword } = validBody;
      const response = await POST(postRequest(withoutPassword));
      expect(response.status).toBe(401);
    });

    it("rejects when the TOTP re-auth rate limit is exceeded", async () => {
      mocks.checkAdminLoginRateLimit.mockImplementation(async (kind: string) => ({ allowed: kind !== "reauth-totp" }));
      const response = await POST(postRequest(validBody));
      expect(response.status).toBe(429);
      expect(mocks.verifyTotpCode).not.toHaveBeenCalled();
    });

    it("rejects an incorrect TOTP code even with the right password", async () => {
      mocks.verifyTotpCode.mockReturnValue(false);
      const response = await POST(postRequest(validBody));
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Incorrect authenticator code." });
      expect(mocks.recordAdminLoginAttempt).toHaveBeenCalledWith("reauth-totp");
      expect(mocks.userExists).not.toHaveBeenCalled();
    });

    it("rejects a missing TOTP code", async () => {
      const { totpCode: _totpCode, ...withoutTotp } = validBody;
      const response = await POST(postRequest(withoutTotp));
      expect(response.status).toBe(401);
    });

    it("proceeds once both password and TOTP are correct", async () => {
      const response = await POST(postRequest(validBody));
      expect(response.status).toBe(200);
      expect(mocks.verifyAdminPassword).toHaveBeenCalledWith("correct-password");
      expect(mocks.verifyTotpCode).toHaveBeenCalledWith("123456");
    });
  });

  it("returns 404 for an email with no real account, without creating a session", async () => {
    mocks.userExists.mockResolvedValue(false);
    const response = await POST(postRequest({ ...validBody, email: "nobody@example.com" }));
    expect(response.status).toBe(404);
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("normalises the target email (trims and lowercases) before every downstream call", async () => {
    await POST(postRequest({ ...validBody, email: "  Rider@Example.com  " }));
    expect(mocks.userExists).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.createSessionForEmail).toHaveBeenCalledWith("rider@example.com", expect.any(String), expect.any(String));
  });

  it("logs the impersonation start against the target account, with a fresh sessionId and the trimmed reason", async () => {
    await POST(postRequest({ ...validBody, reason: "  checking a ticket  " }));
    expect(mocks.logImpersonation).toHaveBeenCalledWith("rider@example.com", expect.any(String), "start", "session-abc", "checking a ticket");
  });

  it("extracts the client ip from x-forwarded-for, taking only the first hop", async () => {
    await POST(postRequest(validBody, { forwardedFor: "1.2.3.4, 5.6.7.8" }));
    expect(mocks.logImpersonation).toHaveBeenCalledWith("rider@example.com", "1.2.3.4", "start", "session-abc", "checking a support ticket");
  });

  it("falls back to 'unknown' ip when x-forwarded-for is absent", async () => {
    await POST(postRequest(validBody));
    expect(mocks.logImpersonation).toHaveBeenCalledWith("rider@example.com", "unknown", "start", "session-abc", "checking a support ticket");
  });

  // The core scoping guarantee: the session handed back is a normal
  // user session for the TARGET account only (created via the same
  // createSessionForEmail() the real sign-in flow uses), never the
  // admin's own admin_session cookie re-used or escalated. Admin access
  // stays gated on the separate admin_session cookie, untouched here.
  it("sets the impersonation session cookie to the value created for the target account only", async () => {
    mocks.createSessionForEmail.mockResolvedValue({ cookieValue: "target-only-session", maxAge: 999 });

    const response = await POST(postRequest(validBody));

    const sessionCookie = response.cookies.get("session");
    expect(sessionCookie).toMatchObject({ name: "session", value: "target-only-session", httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(response.cookies.get("admin_session")).toBeUndefined();
  });

  it("marks which account is being impersonated via a dedicated cookie", async () => {
    const response = await POST(postRequest(validBody));
    const marker = response.cookies.get("impersonating_as");
    expect(marker).toMatchObject({ name: "impersonating_as", value: "rider@example.com", httpOnly: true });
  });

  it("stores the session's own correlation id in a separate cookie", async () => {
    const response = await POST(postRequest(validBody));
    const marker = response.cookies.get("impersonation_session_id");
    expect(marker).toMatchObject({ name: "impersonation_session_id", value: "session-abc", httpOnly: true });
  });

  it("preserves the admin's own prior session cookie so it can be restored on exit", async () => {
    const response = await POST(postRequest(validBody, { cookie: "session=admins-own-session" }));
    const prior = response.cookies.get("admin_prior_session");
    expect(prior).toMatchObject({ name: "admin_prior_session", value: "admins-own-session", httpOnly: true });
  });

  it("does not set a prior-session cookie when the admin had no session cookie beforehand", async () => {
    const response = await POST(postRequest(validBody));
    expect(response.cookies.get("admin_prior_session")).toBeUndefined();
  });

  it("returns ok:true on a successful impersonation start", async () => {
    const response = await POST(postRequest(validBody));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

describe("DELETE /api/tomasz/impersonate (exit)", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.logImpersonation.mockResolvedValue(undefined);
  });

  // Deliberate design per the source comment: exiting must work even
  // without a currently-valid admin session, so getAdminSession is
  // never even consulted on this path.
  it("succeeds without requiring any admin session", async () => {
    const response = await DELETE(deleteRequest("impersonating_as=rider@example.com; impersonation_session_id=session-abc"));
    expect(response.status).toBe(200);
    expect(mocks.getAdminSession).not.toHaveBeenCalled();
  });

  it("logs the impersonation end (with the matching sessionId) when both cookies are present", async () => {
    await DELETE(deleteRequest("impersonating_as=rider@example.com; impersonation_session_id=session-abc"));
    expect(mocks.logImpersonation).toHaveBeenCalledWith("rider@example.com", "unknown", "end", "session-abc");
  });

  it("does not log anything when there was no active impersonation to end", async () => {
    await DELETE(deleteRequest());
    expect(mocks.logImpersonation).not.toHaveBeenCalled();
  });

  it("does not log anything when the sessionId cookie is missing, even if impersonating_as is present", async () => {
    await DELETE(deleteRequest("impersonating_as=rider@example.com"));
    expect(mocks.logImpersonation).not.toHaveBeenCalled();
  });

  it("restores the admin's prior session when one was preserved", async () => {
    const response = await DELETE(
      deleteRequest("impersonating_as=rider@example.com; impersonation_session_id=session-abc; admin_prior_session=admins-own-session")
    );
    const restored = response.cookies.get("session");
    expect(restored).toMatchObject({ name: "session", value: "admins-own-session" });
  });

  it("deletes the session cookie outright when there was no prior session to restore", async () => {
    const response = await DELETE(deleteRequest("impersonating_as=rider@example.com; impersonation_session_id=session-abc"));
    const sessionCookie = response.cookies.get("session");
    // A deleted cookie is expressed as an empty value with an expiry in the past.
    expect(sessionCookie?.value ?? "").toBe("");
  });

  it("always clears the impersonating_as, admin_prior_session and impersonation_session_id cookies", async () => {
    const response = await DELETE(
      deleteRequest("impersonating_as=rider@example.com; impersonation_session_id=session-abc; admin_prior_session=admins-own-session")
    );
    expect(response.cookies.get("impersonating_as")?.value ?? "").toBe("");
    expect(response.cookies.get("admin_prior_session")?.value ?? "").toBe("");
    expect(response.cookies.get("impersonation_session_id")?.value ?? "").toBe("");
  });
});
