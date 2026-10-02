import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserDoc: vi.fn(),
  isTwoFactorEnabled: vi.fn(),
  isPro: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/auth/twoFactor", () => ({ isTwoFactorEnabled: mocks.isTwoFactorEnabled }));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));

import { GET } from "@/app/api/app/account/route";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  mocks.isTwoFactorEnabled.mockResolvedValue(false);
  mocks.isPro.mockResolvedValue(false);
});

describe("GET /api/app/account", () => {
  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.getUserDoc).not.toHaveBeenCalled();
  });

  it("gives the signed-in account's own settings, never cached", async () => {
    mocks.getUserDoc.mockResolvedValue({ displayName: "Alex" });
    mocks.isTwoFactorEnabled.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ email: "rider@example.com", displayName: "Alex", twoFactorEnabled: true, isPro: false, proTrialDays: 14, pendingDeletion: null });
    expect(mocks.getUserDoc).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.isTwoFactorEnabled).toHaveBeenCalledWith("rider@example.com");
  });

  it("works for an account with no user document yet", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    expect(await (await GET()).json()).toEqual({ email: "rider@example.com", displayName: "", twoFactorEnabled: false, isPro: false, proTrialDays: 14, pendingDeletion: null });
  });

  it("offers the website's free trial only to an account that could still get one", async () => {
    mocks.getUserDoc.mockResolvedValue({ stripeCustomerId: "cus_1" });
    expect((await (await GET()).json()).proTrialDays).toBe(0);
    mocks.getUserDoc.mockResolvedValue({});
    mocks.isPro.mockResolvedValue(true);
    expect((await (await GET()).json()).proTrialDays).toBe(0);
  });

  it("says when a requested deletion will happen", async () => {
    const inTenDays = new Date(Date.now() + 10 * 86400000).toISOString();
    mocks.getUserDoc.mockResolvedValue({ pendingDeletionAt: inTenDays });
    const { pendingDeletion } = await (await GET()).json();
    expect(pendingDeletion.daysRemaining).toBe(10);
    expect(pendingDeletion.deleteAfterLabel).toMatch(/\d{1,2} \w+ \d{4}/);
  });

  it("says whether the account is Pro, and treats a failed check as not Pro", async () => {
    mocks.getUserDoc.mockResolvedValue({});
    mocks.isPro.mockResolvedValue(true);
    expect((await (await GET()).json()).isPro).toBe(true);
    mocks.isPro.mockRejectedValue(new Error("Stripe down"));
    expect((await (await GET()).json()).isPro).toBe(false);
  });
});
