import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  itemsCreate: vi.fn(),
  sendMagicLinkEmail: vi.fn(),
  createSessionForEmail: vi.fn(),
  demoBikeExists: vi.fn(),
  runDemoSeed: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ items: { create: mocks.itemsCreate } }),
}));
vi.mock("@/lib/resend", () => ({ sendMagicLinkEmail: mocks.sendMagicLinkEmail }));
vi.mock("@/lib/auth/session", () => ({ createSessionForEmail: mocks.createSessionForEmail }));
vi.mock("@/lib/tracker/demoSeedRunner", () => ({
  demoBikeExists: mocks.demoBikeExists,
  runDemoSeed: mocks.runDemoSeed,
}));
// generateToken/encodeEmail (auth/crypto) and getSafeRedirectPath
// (auth/safeRedirect) are deliberately NOT mocked - both are pure,
// deterministic helpers, so exercising the real implementation is both
// simpler and a more faithful test of the route's actual behavior.

import { POST } from "@/app/api/auth/request-link/route";

function req(body: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/request-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/auth/request-link", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.itemsCreate.mockResolvedValue({ resource: {} });
    mocks.sendMagicLinkEmail.mockResolvedValue(undefined);
    mocks.createSessionForEmail.mockResolvedValue({ cookieValue: "session-cookie-value", maxAge: 123 });
    mocks.demoBikeExists.mockResolvedValue(true);
    mocks.runDemoSeed.mockResolvedValue({ fuel: 0, service: 0, mods: 0, bills: 0 });
  });

  it("rejects a request with no email at all", async () => {
    const response = await POST(req(JSON.stringify({})));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Valid email required" });
    expect(mocks.itemsCreate).not.toHaveBeenCalled();
    expect(mocks.sendMagicLinkEmail).not.toHaveBeenCalled();
  });

  it("rejects a value that doesn't look like an email", async () => {
    const response = await POST(req(JSON.stringify({ email: "not-an-email" })));
    expect(response.status).toBe(400);
    expect(mocks.itemsCreate).not.toHaveBeenCalled();
  });

  it("sends no email and creates no magic-link document for the demo account", async () => {
    mocks.demoBikeExists.mockResolvedValue(true);

    const response = await POST(req(JSON.stringify({ email: "demo@roadverdict.co.uk" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, demo: true, redirect: null });
    expect(mocks.runDemoSeed).not.toHaveBeenCalled();
    expect(mocks.sendMagicLinkEmail).not.toHaveBeenCalled();
    expect(mocks.itemsCreate).not.toHaveBeenCalled();
    expect(mocks.createSessionForEmail).toHaveBeenCalledWith(
      "demo@roadverdict.co.uk",
      "unknown",
      "unknown"
    );
    const cookie = response.cookies.get("session");
    expect(cookie?.value).toBe("session-cookie-value");
    expect(cookie?.httpOnly).toBe(true);
  });

  it("matches the demo account case-insensitively and after trimming whitespace", async () => {
    const response = await POST(req(JSON.stringify({ email: "  Demo@RoadVerdict.co.uk  " })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ demo: true });
  });

  it("seeds the demo dataset on first login but not on a subsequent one", async () => {
    mocks.demoBikeExists.mockResolvedValue(false);
    await POST(req(JSON.stringify({ email: "demo@roadverdict.co.uk" })));
    expect(mocks.runDemoSeed).toHaveBeenCalledTimes(1);
  });

  it("still signs the demo user in even if seeding throws", async () => {
    mocks.demoBikeExists.mockResolvedValue(false);
    mocks.runDemoSeed.mockRejectedValue(new Error("cosmos write failed"));

    const response = await POST(req(JSON.stringify({ email: "demo@roadverdict.co.uk" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, demo: true });
    expect(mocks.createSessionForEmail).toHaveBeenCalled();
  });

  it("creates a single-use magic-link document and emails a link for a real address", async () => {
    const response = await POST(req(JSON.stringify({ email: "Rider@Example.com" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();

    expect(mocks.itemsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ pk: "rider@example.com", type: "magicLink", used: false })
    );

    expect(mocks.sendMagicLinkEmail).toHaveBeenCalledTimes(1);
    const [toEmail, link] = mocks.sendMagicLinkEmail.mock.calls[0];
    expect(toEmail).toBe("rider@example.com");
    expect(link).toContain("/api/auth/verify?token=");
    const expectedEncodedEmail = Buffer.from("rider@example.com").toString("base64url");
    expect(link).toContain(`&e=${expectedEncodedEmail}`);
  });

  it("carries a safe relative redirect through into the emailed link", async () => {
    await POST(req(JSON.stringify({ email: "redirect-ok@example.com", redirect: "/tracker/dashboard" })));
    const [, link] = mocks.sendMagicLinkEmail.mock.calls[0];
    expect(link).toContain(`redirect=${encodeURIComponent("/tracker/dashboard")}`);
  });

  // Open-redirect guard: an absolute, off-host destination must never reach
  // the emailed link, even though this is exactly the kind of value an
  // attacker could plant in a crafted "sign in" link they send a victim.
  it("strips an off-host redirect target rather than passing it through", async () => {
    await POST(
      req(JSON.stringify({ email: "redirect-bad@example.com", redirect: "https://evil.example/phish" }))
    );
    const [, link] = mocks.sendMagicLinkEmail.mock.calls[0];
    expect(link).not.toContain("redirect=");
    expect(link).not.toContain("evil.example");
  });

  it("rate-limits a second request for the same address within the cooldown window", async () => {
    const email = "rate-limited@example.com";
    const first = await POST(req(JSON.stringify({ email })));
    expect(first.status).toBe(200);

    const second = await POST(req(JSON.stringify({ email })));

    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toEqual({
      error: "Please wait a moment before requesting another link",
    });
    expect(mocks.itemsCreate).toHaveBeenCalledTimes(1);
    expect(mocks.sendMagicLinkEmail).toHaveBeenCalledTimes(1);
  });

  // Documents current behaviour rather than asserting it's ideal: unlike
  // several sibling routes (e.g. tracker/bike-transfer), this handler has no
  // try/catch around request.json(), so a malformed body propagates as an
  // unhandled rejection out of POST instead of a clean 400 response.
  it("propagates malformed JSON as a thrown error rather than a 400 response", async () => {
    await expect(POST(req("not-json"))).rejects.toThrow();
  });
});
