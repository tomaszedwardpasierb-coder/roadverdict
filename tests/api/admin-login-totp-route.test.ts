import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  consumePendingTotp: vi.fn(),
  createAdminSession: vi.fn(),
  verifyTotpCode: vi.fn(),
  invalidatePendingTotp: vi.fn(),
  checkAdminLoginRateLimit: vi.fn(),
  recordAdminLoginAttempt: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({
  consumePendingTotp: mocks.consumePendingTotp,
  createAdminSession: mocks.createAdminSession,
  invalidatePendingTotp: mocks.invalidatePendingTotp,
  checkAdminLoginRateLimit: mocks.checkAdminLoginRateLimit,
  recordAdminLoginAttempt: mocks.recordAdminLoginAttempt,
}));
vi.mock("@/lib/admin/totp", () => ({ verifyTotpCode: mocks.verifyTotpCode }));

import { POST } from "@/app/api/admin/login-totp/route";

function req(body: string, pendingCookie?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (pendingCookie) headers["cookie"] = `admin_pending=${pendingCookie}`;
  return new NextRequest("http://localhost/api/admin/login-totp", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/admin/login-totp", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.createAdminSession.mockResolvedValue("admin-session-raw-token");
    mocks.checkAdminLoginRateLimit.mockResolvedValue({ allowed: true });
  });

  it("rejects every attempt once the rate limit is hit, without even checking the code", async () => {
    mocks.checkAdminLoginRateLimit.mockResolvedValue({ allowed: false });
    const response = await POST(req(JSON.stringify({ code: "123456" }), "pending-raw"));
    expect(response.status).toBe(429);
    expect(mocks.verifyTotpCode).not.toHaveBeenCalled();
  });

  it("rejects a request with no pending-login cookie at all", async () => {
    const response = await POST(req(JSON.stringify({ code: "123456" })));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Session expired. Enter your password again.",
    });
    expect(mocks.verifyTotpCode).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON even with a valid pending cookie", async () => {
    const response = await POST(req("not-json", "pending-raw"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("rejects a missing code without ever calling verifyTotpCode", async () => {
    const response = await POST(req(JSON.stringify({}), "pending-raw"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Incorrect code." });
    expect(mocks.verifyTotpCode).not.toHaveBeenCalled();
  });

  it("rejects an incorrect TOTP code without ever consuming the pending token", async () => {
    mocks.verifyTotpCode.mockReturnValue(false);
    const response = await POST(req(JSON.stringify({ code: "000000" }), "pending-raw"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Incorrect code." });
    expect(mocks.consumePendingTotp).not.toHaveBeenCalled();
    expect(mocks.createAdminSession).not.toHaveBeenCalled();
  });

  // The actual security fix: a wrong guess used to leave the pending
  // token alive and retryable for its full 5-minute TTL. It must now be
  // burned immediately, so every further attempt needs a fresh password
  // check (which is itself rate-limited) rather than unlimited free
  // guesses against one static token.
  it("burns the pending token and records the failed attempt on an incorrect code", async () => {
    mocks.verifyTotpCode.mockReturnValue(false);
    await POST(req(JSON.stringify({ code: "000000" }), "pending-raw"));
    expect(mocks.invalidatePendingTotp).toHaveBeenCalledWith("pending-raw");
    expect(mocks.recordAdminLoginAttempt).toHaveBeenCalledWith("totp");
  });

  it("does not burn the pending token or record an attempt on a correct code", async () => {
    mocks.verifyTotpCode.mockReturnValue(true);
    mocks.consumePendingTotp.mockResolvedValue(true);
    await POST(req(JSON.stringify({ code: "123456" }), "pending-raw"));
    expect(mocks.invalidatePendingTotp).not.toHaveBeenCalled();
    expect(mocks.recordAdminLoginAttempt).not.toHaveBeenCalled();
  });

  it("rejects a correct code against an expired or already-used pending token", async () => {
    mocks.verifyTotpCode.mockReturnValue(true);
    mocks.consumePendingTotp.mockResolvedValue(false);

    const response = await POST(req(JSON.stringify({ code: "123456" }), "pending-raw"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Session expired. Enter your password again.",
    });
    expect(mocks.createAdminSession).not.toHaveBeenCalled();
  });

  it("issues a 12h admin_session cookie and clears admin_pending on success", async () => {
    mocks.verifyTotpCode.mockReturnValue(true);
    mocks.consumePendingTotp.mockResolvedValue(true);

    const response = await POST(req(JSON.stringify({ code: "123456" }), "pending-raw"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.consumePendingTotp).toHaveBeenCalledWith("pending-raw");

    const sessionCookie = response.cookies.get("admin_session");
    expect(sessionCookie?.value).toBe("admin-session-raw-token");
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.secure).toBe(true);
    expect(sessionCookie?.sameSite).toBe("lax");
    expect(sessionCookie?.maxAge).toBe(12 * 60 * 60);

    const pendingCookie = response.cookies.get("admin_pending");
    expect(pendingCookie?.value).toBe("");
    expect(pendingCookie?.expires).toEqual(new Date(0));
  });

  // The pending token is meant to be single-use: once consumePendingTotp()
  // has reported it consumed (real implementation deletes the Cosmos doc),
  // a second attempt with the same cookie must not be able to mint another
  // admin session.
  it("cannot replay the same pending token to mint a second admin session", async () => {
    mocks.verifyTotpCode.mockReturnValue(true);
    mocks.consumePendingTotp.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const first = await POST(req(JSON.stringify({ code: "123456" }), "pending-raw"));
    expect(first.status).toBe(200);

    const second = await POST(req(JSON.stringify({ code: "123456" }), "pending-raw"));
    expect(second.status).toBe(401);
    expect(mocks.createAdminSession).toHaveBeenCalledTimes(1);
  });
});
