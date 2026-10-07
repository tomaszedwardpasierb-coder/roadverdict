// Place at: tests/api/tomasz-account-tags-route.test.ts
// The bulk tag and bulk "give Pro" routes behind /tomasz's All accounts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getAdminSession: vi.fn(), setAccountTag: vi.fn(), grantPremiumUnlessPaying: vi.fn() }));
vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/userAccount", () => ({
  isAccountTag: (t: unknown) => t === "tester" || t === "friend" || t === "press",
  setAccountTag: mocks.setAccountTag,
  grantPremiumUnlessPaying: mocks.grantPremiumUnlessPaying,
  MAX_GRANT_YEARS: 3,
}));

import { POST as tags } from "@/app/api/tomasz/accounts/tags/route";
import { POST as bulkGrant } from "@/app/api/tomasz/accounts/grant-premium-bulk/route";

function req(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getAdminSession.mockResolvedValue(true);
  mocks.setAccountTag.mockResolvedValue(undefined);
});

describe("POST /api/tomasz/accounts/tags", () => {
  it("rejects a non-admin request", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const res = await tags(req("/api/tomasz/accounts/tags", { emails: ["a@example.com"], tag: "tester", on: true }));
    expect(res.status).toBe(401);
    expect(mocks.setAccountTag).not.toHaveBeenCalled();
  });

  it("rejects unknown tags and empty selections", async () => {
    expect((await tags(req("/api/tomasz/accounts/tags", { emails: ["a@example.com"], tag: "vip", on: true }))).status).toBe(400);
    expect((await tags(req("/api/tomasz/accounts/tags", { emails: [], tag: "tester", on: true }))).status).toBe(400);
  });

  it("tags every normalised email and reports failures", async () => {
    mocks.setAccountTag.mockImplementation(async (email: string) => {
      if (email === "gone@example.com") throw new Error("No account");
    });
    const res = await tags(req("/api/tomasz/accounts/tags", { emails: [" A@Example.com ", "gone@example.com"], tag: "tester", on: true }));
    expect(await res.json()).toEqual({ ok: true, updated: 1, failed: ["gone@example.com"] });
    expect(mocks.setAccountTag).toHaveBeenCalledWith("a@example.com", "tester", true);
  });
});

describe("POST /api/tomasz/accounts/grant-premium-bulk", () => {
  it("rejects a non-admin request and a past date", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    expect((await bulkGrant(req("/api/tomasz/accounts/grant-premium-bulk", { emails: ["a@example.com"], expiresAt: "2099-01-01" }))).status).toBe(401);
    mocks.getAdminSession.mockResolvedValue(true);
    expect((await bulkGrant(req("/api/tomasz/accounts/grant-premium-bulk", { emails: ["a@example.com"], expiresAt: "2001-01-01" }))).status).toBe(400);
  });

  it("counts what happened to each account", async () => {
    mocks.grantPremiumUnlessPaying.mockResolvedValueOnce("granted").mockResolvedValueOnce("paying").mockRejectedValueOnce(new Error("x"));
    const until = new Date(Date.now() + 30 * 86400000).toISOString();
    const res = await bulkGrant(
      req("/api/tomasz/accounts/grant-premium-bulk", { emails: ["a@example.com", "b@example.com", "c@example.com"], expiresAt: until })
    );
    expect(await res.json()).toMatchObject({ ok: true, granted: 1, paying: 1, failed: 1 });
  });
});
