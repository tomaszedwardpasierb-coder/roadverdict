// Switching the app store reviewers' sign-in on and off from /tomasz.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  enableReviewerAccess: vi.fn(),
  disableReviewerAccess: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/auth/reviewerAccess", () => ({
  enableReviewerAccess: mocks.enableReviewerAccess,
  disableReviewerAccess: mocks.disableReviewerAccess,
}));

import { DELETE, POST } from "@/app/api/tomasz/reviewer-access/route";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getAdminSession.mockResolvedValue(true);
  mocks.enableReviewerAccess.mockResolvedValue({ code: "482913", enabledAt: "2026-10-03T12:00:00.000Z" });
  mocks.disableReviewerAccess.mockResolvedValue(undefined);
});

describe("/api/tomasz/reviewer-access", () => {
  it("is admin-only", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    expect((await POST()).status).toBe(401);
    expect((await DELETE()).status).toBe(401);
    expect(mocks.enableReviewerAccess).not.toHaveBeenCalled();
    expect(mocks.disableReviewerAccess).not.toHaveBeenCalled();
  });

  it("switches it on and hands back the new code, never cached", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ code: "482913", enabledAt: "2026-10-03T12:00:00.000Z" });
  });

  it("switches it off", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(mocks.disableReviewerAccess).toHaveBeenCalled();
  });
});
