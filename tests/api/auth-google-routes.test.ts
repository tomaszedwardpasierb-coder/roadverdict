// "Continue with Google": the website's two legs and the app's route. The
// token check itself is in tests/unit/googleSignIn.test.ts - mocked here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyGoogleIdToken: vi.fn(),
  exchangeCode: vi.fn(),
  isAccountBlocked: vi.fn(),
  isTwoFactorEnabled: vi.fn(),
  createPendingLogin: vi.fn(),
  createSessionForEmail: vi.fn(),
  recordFunnelStep: vi.fn(),
}));

vi.mock("@/lib/auth/googleSignIn", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/googleSignIn")>();
  return { ...real, verifyGoogleIdToken: mocks.verifyGoogleIdToken, exchangeCode: mocks.exchangeCode };
});
vi.mock("@/lib/tracker/userDoc", () => ({ isAccountBlocked: mocks.isAccountBlocked }));
vi.mock("@/lib/auth/signInRateLimit", () => ({ getClientIp: () => "1.2.3.4" }));
vi.mock("@/lib/auth/twoFactor", () => ({ isTwoFactorEnabled: mocks.isTwoFactorEnabled, createPendingLogin: mocks.createPendingLogin }));
vi.mock("@/lib/auth/session", () => ({ createSessionForEmail: mocks.createSessionForEmail }));
vi.mock("@/lib/analytics/funnel", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/analytics/funnel")>();
  return { ...real, recordFunnelStep: mocks.recordFunnelStep };
});

import { GET as start } from "@/app/api/auth/google/start/route";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { GET as appConfig, POST as appGoogle } from "@/app/api/auth/app/google/route";

const BASE = "https://roadverdict.co.uk";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  process.env.GOOGLE_OAUTH_CLIENT_ID = "web-client";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
  mocks.isAccountBlocked.mockResolvedValue(false);
  mocks.isTwoFactorEnabled.mockResolvedValue(false);
  mocks.createSessionForEmail.mockResolvedValue({ cookieValue: "session-token", maxAge: 100 });
  mocks.createPendingLogin.mockResolvedValue({ cookieValue: "pending-token", maxAge: 300 });
  mocks.exchangeCode.mockResolvedValue("id-token");
  mocks.verifyGoogleIdToken.mockResolvedValue("rider@example.com");
});
afterEach(() => {
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
});

async function startAttempt(query = "redirect=%2Fdashboard%3FaddVehicle%3Dcar&src=google") {
  const res = await start(new NextRequest(`${BASE}/api/auth/google/start?${query}`));
  const cookie = res.cookies.get("google_signin")!.value;
  const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
  return { res, cookie, state };
}

function callbackRequest(query: string, cookie?: string) {
  return new NextRequest(`${BASE}/api/auth/google/callback?${query}`, { headers: cookie ? { cookie: `google_signin=${cookie}` } : {} });
}

describe("website: Continue with Google", () => {
  it("sends the visitor to Google and remembers the attempt", async () => {
    const { res } = await startAttempt();
    expect(res.headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    expect(res.cookies.get("google_signin")).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/google" });
  });

  it("goes back to the sign-in page when Google isn't set up", async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const res = await start(new NextRequest(`${BASE}/api/auth/google/start`));
    expect(res.headers.get("location")).toBe(`${BASE}/login`);
  });

  it("signs in and carries on to where the visitor was going", async () => {
    const { cookie, state } = await startAttempt();
    const res = await callback(callbackRequest(`code=abc&state=${state}`, cookie));
    expect(res.headers.get("location")).toBe(`${BASE}/dashboard?addVehicle=car`);
    expect(res.cookies.get("session")?.value).toBe("session-token");
    expect(mocks.createSessionForEmail).toHaveBeenCalledWith("rider@example.com", "1.2.3.4", expect.any(String), { source: "google" });
    expect(mocks.recordFunnelStep).toHaveBeenCalledWith("signed_in", expect.objectContaining({ source: "google" }));
    const nonce = JSON.parse(Buffer.from(cookie, "base64url").toString()).nonce;
    expect(mocks.verifyGoogleIdToken).toHaveBeenCalledWith("id-token", { nonce });
  });

  it("refuses a state that doesn't match the attempt, or no attempt at all", async () => {
    const { cookie } = await startAttempt();
    const wrong = await callback(callbackRequest("code=abc&state=forged", cookie));
    expect(wrong.headers.get("location")).toBe(`${BASE}/login?error=google_failed&redirect=%2Fdashboard%3FaddVehicle%3Dcar`);
    const none = await callback(callbackRequest("code=abc&state=forged"));
    expect(none.headers.get("location")).toBe(`${BASE}/login?error=google_failed`);
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("treats a cancel on Google's screen as no harm done", async () => {
    const { cookie } = await startAttempt();
    const res = await callback(callbackRequest("error=access_denied", cookie));
    expect(res.headers.get("location")).toBe(`${BASE}/login?redirect=%2Fdashboard%3FaddVehicle%3Dcar`);
  });

  it("fails safely when Google's token doesn't check out", async () => {
    mocks.verifyGoogleIdToken.mockResolvedValue(null);
    const { cookie, state } = await startAttempt();
    const res = await callback(callbackRequest(`code=abc&state=${state}`, cookie));
    expect(res.headers.get("location")).toContain("error=google_failed");
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("asks for the 2FA code when it's on, and refuses a blocked account", async () => {
    mocks.isTwoFactorEnabled.mockResolvedValue(true);
    let { cookie, state } = await startAttempt();
    const twoFa = await callback(callbackRequest(`code=abc&state=${state}`, cookie));
    expect(twoFa.headers.get("location")).toBe(`${BASE}/login/verify-2fa?redirect=%2Fdashboard%3FaddVehicle%3Dcar`);
    expect(twoFa.cookies.get("totp_pending")?.value).toBe("pending-token");
    expect(twoFa.cookies.get("session")).toBeUndefined();

    mocks.isAccountBlocked.mockResolvedValue(true);
    ({ cookie, state } = await startAttempt());
    const blocked = await callback(callbackRequest(`code=abc&state=${state}`, cookie));
    expect(blocked.headers.get("location")).toBe(`${BASE}/login?error=blocked`);
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });
});

describe("app: Continue with Google", () => {
  function post(body: unknown) {
    return appGoogle(new NextRequest(`${BASE}/api/auth/app/google`, { method: "POST", body: JSON.stringify(body) }));
  }

  it("tells the app the client id only when it's switched on", async () => {
    expect(await (await appConfig()).json()).toEqual({ webClientId: "web-client" });
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect(await (await appConfig()).json()).toEqual({ webClientId: null });
  });

  it("trades a good Google token for an app session", async () => {
    const res = await post({ idToken: "id-token" });
    expect(await res.json()).toEqual({ token: "session-token", expiresInSeconds: 100 });
    expect(mocks.verifyGoogleIdToken).toHaveBeenCalledWith("id-token");
    expect(mocks.createSessionForEmail).toHaveBeenCalledWith("rider@example.com", "1.2.3.4", expect.any(String), { client: "app" });
  });

  it("refuses a bad token, a blocked account, and hands 2FA accounts a pending token", async () => {
    mocks.verifyGoogleIdToken.mockResolvedValueOnce(null);
    expect((await post({ idToken: "bad" })).status).toBe(401);
    mocks.isAccountBlocked.mockResolvedValueOnce(true);
    expect((await post({ idToken: "id-token" })).status).toBe(403);
    mocks.isTwoFactorEnabled.mockResolvedValueOnce(true);
    expect(await (await post({ idToken: "id-token" })).json()).toEqual({ twoFactorRequired: true, pendingToken: "pending-token", expiresInSeconds: 300 });
    expect((await post({})).status).toBe(400);
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("is refused while Google sign-in isn't set up", async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect((await post({ idToken: "id-token" })).status).toBe(503);
  });
});
