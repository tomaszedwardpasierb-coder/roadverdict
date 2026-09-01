import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  patch: vi.fn(),
  item: vi.fn(),
  createSessionForEmail: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ item: mocks.item }),
}));
vi.mock("@/lib/auth/session", () => ({ createSessionForEmail: mocks.createSessionForEmail }));
// hashToken/encodeEmail/decodeEmail (auth/crypto) and getSafeRedirectPath
// (auth/safeRedirect) are deliberately NOT mocked - pure, deterministic
// helpers that are simpler and more realistic to exercise for real.

import { GET } from "@/app/api/auth/verify/route";
import { encodeEmail, hashToken } from "@/lib/auth/crypto";

const APP_URL = "https://roadverdict.co.uk";
const EMAIL = "rider@example.com";
const RAW_TOKEN = "raw-magic-link-token";

function verifyUrl(overrides: Partial<{ token: string | null; e: string | null; redirect: string }> = {}) {
  const params = new URLSearchParams();
  const token = overrides.token === undefined ? RAW_TOKEN : overrides.token;
  const e = overrides.e === undefined ? encodeEmail(EMAIL) : overrides.e;
  if (token !== null) params.set("token", token);
  if (e !== null) params.set("e", e);
  if (overrides.redirect) params.set("redirect", overrides.redirect);
  return `http://localhost/api/auth/verify?${params.toString()}`;
}

function req(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

function validDoc(overrides: Record<string, unknown> = {}) {
  return {
    type: "magicLink",
    used: false,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe("GET /api/auth/verify", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.item.mockReturnValue({ read: mocks.read, patch: mocks.patch });
    mocks.patch.mockResolvedValue({ resource: {} });
    mocks.createSessionForEmail.mockResolvedValue({ cookieValue: "session-cookie-value", maxAge: 123 });
  });

  it("redirects to an error page when the token param is missing", async () => {
    const response = await GET(req(verifyUrl({ token: null })));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toBe(`${APP_URL}/login?error=invalid_link`);
    expect(mocks.item).not.toHaveBeenCalled();
  });

  it("redirects to an error page when the encoded-email param is missing", async () => {
    const response = await GET(req(verifyUrl({ e: null })));
    expect(response.headers.get("location")).toBe(`${APP_URL}/login?error=invalid_link`);
    expect(mocks.item).not.toHaveBeenCalled();
  });

  it("redirects to an error page when the Cosmos lookup throws (e.g. wrong id/pk combination)", async () => {
    mocks.read.mockRejectedValue(new Error("not found"));
    const response = await GET(req(verifyUrl()));
    expect(response.headers.get("location")).toBe(`${APP_URL}/login?error=invalid_link`);
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  it("treats a missing document (no throw, just no resource) the same as an expired link", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    const response = await GET(req(verifyUrl()));
    expect(response.headers.get("location")).toBe(`${APP_URL}/login?error=expired_link`);
  });

  it("redirects to an expired-link page for a doc of the wrong type", async () => {
    mocks.read.mockResolvedValue({ resource: validDoc({ type: "session" }) });
    const response = await GET(req(verifyUrl()));
    expect(response.headers.get("location")).toBe(`${APP_URL}/login?error=expired_link`);
  });

  it("redirects to an expired-link page for a token past its expiry", async () => {
    mocks.read.mockResolvedValue({
      resource: validDoc({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    });
    const response = await GET(req(verifyUrl()));
    expect(response.headers.get("location")).toBe(`${APP_URL}/login?error=expired_link`);
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
  });

  // The single-use guard: a link that's already been clicked once must not
  // grant a second session just by visiting the same URL again.
  it("rejects a replayed (already-used) magic link", async () => {
    mocks.read.mockResolvedValue({ resource: validDoc({ used: true }) });
    const response = await GET(req(verifyUrl()));
    expect(response.headers.get("location")).toBe(`${APP_URL}/login?error=expired_link`);
    expect(mocks.createSessionForEmail).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("marks the link used, creates a session, and redirects to the dashboard by default", async () => {
    mocks.read.mockResolvedValue({ resource: validDoc() });

    const response = await GET(req(verifyUrl()));

    expect(mocks.item).toHaveBeenCalledWith(hashToken(RAW_TOKEN), EMAIL);
    expect(mocks.patch).toHaveBeenCalledWith([{ op: "replace", path: "/used", value: true }]);
    expect(mocks.createSessionForEmail).toHaveBeenCalledWith(EMAIL, "unknown", "unknown");

    expect(response.headers.get("location")).toBe(`${APP_URL}/dashboard`);
    const cookie = response.cookies.get("session");
    expect(cookie?.value).toBe("session-cookie-value");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
  });

  it("redirects to a safe, relative destination when one was requested", async () => {
    mocks.read.mockResolvedValue({ resource: validDoc() });
    const response = await GET(req(verifyUrl({ redirect: "/tracker/settings" })));
    expect(response.headers.get("location")).toBe(`${APP_URL}/tracker/settings`);
  });

  // Open-redirect guard on the receiving end too: even a genuinely valid
  // token/email pair must not let an attacker-crafted absolute redirect in
  // the URL send the now-authenticated user off-host.
  it("falls back to the dashboard for an off-host redirect target, even on an otherwise valid link", async () => {
    mocks.read.mockResolvedValue({ resource: validDoc() });
    const response = await GET(req(verifyUrl({ redirect: "https://evil.example/phish" })));
    expect(response.headers.get("location")).toBe(`${APP_URL}/dashboard`);
  });

  it("looks up the document using the email decoded from the URL, not some other partition", async () => {
    const otherEmail = "someone-else@example.com";
    mocks.read.mockResolvedValue({ resource: validDoc() });

    await GET(req(verifyUrl({ e: encodeEmail(otherEmail) })));

    expect(mocks.item).toHaveBeenCalledWith(hashToken(RAW_TOKEN), otherEmail);
    expect(mocks.createSessionForEmail).toHaveBeenCalledWith(otherEmail, "unknown", "unknown");
  });
});
