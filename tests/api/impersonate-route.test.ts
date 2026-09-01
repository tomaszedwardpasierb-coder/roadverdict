import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  createSessionForEmail: vi.fn(),
  userExists: vi.fn(),
  logImpersonation: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
// createSessionForEmail is the same helper the real sign-in flow uses -
// its own internals (user doc bootstrap, session doc shape) aren't
// this route's concern, so it's mocked here.
vi.mock("@/lib/auth/session", () => ({ createSessionForEmail: mocks.createSessionForEmail }));
vi.mock("@/lib/admin/impersonation", () => ({
  userExists: mocks.userExists,
  logImpersonation: mocks.logImpersonation,
}));

import { POST, DELETE } from "@/app/api/tomasz/impersonate/route";

function postRequest(body: string, opts?: { cookie?: string; forwardedFor?: string }): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts?.cookie) headers.cookie = opts.cookie;
  if (opts?.forwardedFor) headers["x-forwarded-for"] = opts.forwardedFor;
  return new NextRequest("http://localhost/api/tomasz/impersonate", { method: "POST", headers, body });
}

function deleteRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new NextRequest("http://localhost/api/tomasz/impersonate", { method: "DELETE", headers });
}

describe("POST /api/tomasz/impersonate", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.userExists.mockResolvedValue(true);
    mocks.logImpersonation.mockResolvedValue(undefined);
    mocks.createSessionForEmail.mockResolvedValue({ cookieValue: "target-session-cookie", maxAge: 12345 });
  });

  it("rejects a non-admin request outright, without ever looking up the target account", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(postRequest(JSON.stringify({ email: "victim@example.com" })));
    expect(response.status).toBe(401);
    expect(mocks.userExists).not.toHaveBeenCalled();
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("rejects a request with no admin session cookie at all", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(postRequest(JSON.stringify({ email: "victim@example.com" })));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(postRequest("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a missing or blank email", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(postRequest(JSON.stringify({ email: "   " })));
    expect(response.status).toBe(400);
    expect(mocks.userExists).not.toHaveBeenCalled();
  });

  it("returns 404 for an email with no real account, without creating a session", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.userExists.mockResolvedValue(false);
    const response = await POST(postRequest(JSON.stringify({ email: "nobody@example.com" })));
    expect(response.status).toBe(404);
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("normalises the target email (trims and lowercases) before every downstream call", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(postRequest(JSON.stringify({ email: "  Rider@Example.com  " })));
    expect(mocks.userExists).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.createSessionForEmail).toHaveBeenCalledWith("rider@example.com", expect.any(String), expect.any(String));
  });

  it("logs the impersonation start against the target account", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(postRequest(JSON.stringify({ email: "rider@example.com" })));
    expect(mocks.logImpersonation).toHaveBeenCalledWith("rider@example.com", expect.any(String), "start");
  });

  it("extracts the client ip from x-forwarded-for, taking only the first hop", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(postRequest(JSON.stringify({ email: "rider@example.com" }), { forwardedFor: "1.2.3.4, 5.6.7.8" }));
    expect(mocks.logImpersonation).toHaveBeenCalledWith("rider@example.com", "1.2.3.4", "start");
  });

  it("falls back to 'unknown' ip when x-forwarded-for is absent", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(postRequest(JSON.stringify({ email: "rider@example.com" })));
    expect(mocks.logImpersonation).toHaveBeenCalledWith("rider@example.com", "unknown", "start");
  });

  // The core scoping guarantee: the session handed back is a normal
  // user session for the TARGET account only (created via the same
  // createSessionForEmail() the real sign-in flow uses), never the
  // admin's own admin_session cookie re-used or escalated. Admin access
  // stays gated on the separate admin_session cookie, untouched here.
  it("sets the impersonation session cookie to the value created for the target account only", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.createSessionForEmail.mockResolvedValue({ cookieValue: "target-only-session", maxAge: 999 });

    const response = await POST(postRequest(JSON.stringify({ email: "rider@example.com" })));

    const sessionCookie = response.cookies.get("session");
    expect(sessionCookie).toMatchObject({ name: "session", value: "target-only-session", httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(response.cookies.get("admin_session")).toBeUndefined();
  });

  it("marks which account is being impersonated via a dedicated cookie", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(postRequest(JSON.stringify({ email: "rider@example.com" })));
    const marker = response.cookies.get("impersonating_as");
    expect(marker).toMatchObject({ name: "impersonating_as", value: "rider@example.com", httpOnly: true });
  });

  it("preserves the admin's own prior session cookie so it can be restored on exit", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(
      postRequest(JSON.stringify({ email: "rider@example.com" }), { cookie: "session=admins-own-session" })
    );
    const prior = response.cookies.get("admin_prior_session");
    expect(prior).toMatchObject({ name: "admin_prior_session", value: "admins-own-session", httpOnly: true });
  });

  it("does not set a prior-session cookie when the admin had no session cookie beforehand", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(postRequest(JSON.stringify({ email: "rider@example.com" })));
    expect(response.cookies.get("admin_prior_session")).toBeUndefined();
  });

  it("returns ok:true on a successful impersonation start", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(postRequest(JSON.stringify({ email: "rider@example.com" })));
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
    const response = await DELETE(deleteRequest("impersonating_as=rider@example.com"));
    expect(response.status).toBe(200);
    expect(mocks.getAdminSession).not.toHaveBeenCalled();
  });

  it("logs the impersonation end when an impersonating_as cookie is present", async () => {
    await DELETE(deleteRequest("impersonating_as=rider@example.com"));
    expect(mocks.logImpersonation).toHaveBeenCalledWith("rider@example.com", "unknown", "end");
  });

  it("does not log anything when there was no active impersonation to end", async () => {
    await DELETE(deleteRequest());
    expect(mocks.logImpersonation).not.toHaveBeenCalled();
  });

  it("restores the admin's prior session when one was preserved", async () => {
    const response = await DELETE(
      deleteRequest("impersonating_as=rider@example.com; admin_prior_session=admins-own-session")
    );
    const restored = response.cookies.get("session");
    expect(restored).toMatchObject({ name: "session", value: "admins-own-session" });
  });

  it("deletes the session cookie outright when there was no prior session to restore", async () => {
    const response = await DELETE(deleteRequest("impersonating_as=rider@example.com"));
    const sessionCookie = response.cookies.get("session");
    // A deleted cookie is expressed as an empty value with an expiry in the past.
    expect(sessionCookie?.value ?? "").toBe("");
  });

  it("always clears the impersonating_as and admin_prior_session cookies", async () => {
    const response = await DELETE(
      deleteRequest("impersonating_as=rider@example.com; admin_prior_session=admins-own-session")
    );
    expect(response.cookies.get("impersonating_as")?.value ?? "").toBe("");
    expect(response.cookies.get("admin_prior_session")?.value ?? "").toBe("");
  });
});
