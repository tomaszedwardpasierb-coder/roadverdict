import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyAdminPassword: vi.fn(),
  createPendingTotp: vi.fn(),
  checkAdminLoginRateLimit: vi.fn(),
  recordAdminLoginAttempt: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({
  verifyAdminPassword: mocks.verifyAdminPassword,
  createPendingTotp: mocks.createPendingTotp,
  checkAdminLoginRateLimit: mocks.checkAdminLoginRateLimit,
  recordAdminLoginAttempt: mocks.recordAdminLoginAttempt,
}));

import { POST } from "@/app/api/admin/login-password/route";

function req(body: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/login-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/admin/login-password", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.createPendingTotp.mockResolvedValue("pending-raw-token");
    mocks.checkAdminLoginRateLimit.mockResolvedValue({ allowed: true });
  });

  it("rejects every attempt once the rate limit is hit, without even checking the password", async () => {
    mocks.checkAdminLoginRateLimit.mockResolvedValue({ allowed: false });
    const response = await POST(req(JSON.stringify({ password: "correct-horse-battery-staple" })));
    expect(response.status).toBe(429);
    expect(mocks.verifyAdminPassword).not.toHaveBeenCalled();
  });

  it("records a failed attempt against the rate limiter on an incorrect password", async () => {
    mocks.verifyAdminPassword.mockReturnValue(false);
    await POST(req(JSON.stringify({ password: "wrong" })));
    expect(mocks.recordAdminLoginAttempt).toHaveBeenCalledWith("password");
  });

  it("does not record an attempt against the rate limiter on a correct password", async () => {
    mocks.verifyAdminPassword.mockReturnValue(true);
    await POST(req(JSON.stringify({ password: "correct-horse-battery-staple" })));
    expect(mocks.recordAdminLoginAttempt).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(req("not-json"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    expect(mocks.verifyAdminPassword).not.toHaveBeenCalled();
  });

  it("rejects a missing password without ever calling verifyAdminPassword", async () => {
    const response = await POST(req(JSON.stringify({})));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Incorrect password." });
    expect(mocks.verifyAdminPassword).not.toHaveBeenCalled();
  });

  it("rejects an empty-string password without ever calling verifyAdminPassword", async () => {
    const response = await POST(req(JSON.stringify({ password: "" })));
    expect(response.status).toBe(401);
    expect(mocks.verifyAdminPassword).not.toHaveBeenCalled();
  });

  it("rejects an incorrect password", async () => {
    mocks.verifyAdminPassword.mockReturnValue(false);
    const response = await POST(req(JSON.stringify({ password: "wrong" })));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Incorrect password." });
    expect(mocks.createPendingTotp).not.toHaveBeenCalled();
  });

  it("issues a short-lived, httpOnly admin_pending cookie for a correct password", async () => {
    mocks.verifyAdminPassword.mockReturnValue(true);
    const response = await POST(req(JSON.stringify({ password: "correct-horse-battery-staple" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.verifyAdminPassword).toHaveBeenCalledWith("correct-horse-battery-staple");

    const cookie = response.cookies.get("admin_pending");
    expect(cookie?.value).toBe("pending-raw-token");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(300);
    expect(cookie?.path).toBe("/");

    // A password-only response must never set the full admin session cookie -
    // that only happens after the second (TOTP) factor succeeds.
    expect(response.cookies.get("admin_session")).toBeUndefined();
  });
});
