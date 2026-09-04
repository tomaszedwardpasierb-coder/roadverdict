// Place at: tests/unit/subscriptions.test.ts
//
// isPro() is the one real gate every Pro-only feature in the app calls
// through - real per-account Premium now, granted manually by the
// admin (userAccount.ts's grantPremium(), used from /tomasz) until a
// real payment platform exists. It reads the same `plan` field that
// admin tool writes on the `type: "user"` doc (userDoc.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUserDoc: vi.fn() }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));

import { isPro, getProStatus } from "@/lib/subscriptions";

describe("isPro", () => {
  beforeEach(() => {
    mocks.getUserDoc.mockReset();
  });

  it("returns false when the account has no user doc at all", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    await expect(isPro("rider@example.com")).resolves.toBe(false);
  });

  it("returns false when the account has a user doc but no plan", async () => {
    mocks.getUserDoc.mockResolvedValue({ email: "rider@example.com" });
    await expect(isPro("rider@example.com")).resolves.toBe(false);
  });

  it("returns true when the plan's expiry is in the future", async () => {
    mocks.getUserDoc.mockResolvedValue({
      email: "rider@example.com",
      plan: { grantedAt: "2025-01-01T00:00:00.000Z", expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    await expect(isPro("rider@example.com")).resolves.toBe(true);
  });

  it("returns false once the plan's expiry has passed", async () => {
    mocks.getUserDoc.mockResolvedValue({
      email: "rider@example.com",
      plan: { grantedAt: "2025-01-01T00:00:00.000Z", expiresAt: new Date(Date.now() - 1000).toISOString() },
    });
    await expect(isPro("rider@example.com")).resolves.toBe(false);
  });

  it("fails closed (never Pro) if the underlying lookup throws", async () => {
    mocks.getUserDoc.mockRejectedValue(new Error("Cosmos unavailable"));
    await expect(isPro("rider@example.com")).resolves.toBe(false);
  });
});

describe("getProStatus", () => {
  beforeEach(() => {
    mocks.getUserDoc.mockReset();
  });

  it("returns isPro false with a null expiry and null days when there's no plan", async () => {
    mocks.getUserDoc.mockResolvedValue({ email: "rider@example.com" });
    await expect(getProStatus("rider@example.com")).resolves.toEqual({ isPro: false, expiresAt: null, daysRemaining: null });
  });

  it("returns isPro false with nulls once the plan's expiry has passed, even though a plan object still exists", async () => {
    mocks.getUserDoc.mockResolvedValue({
      email: "rider@example.com",
      plan: { grantedAt: "2025-01-01T00:00:00.000Z", expiresAt: new Date(Date.now() - 1000).toISOString() },
    });
    await expect(getProStatus("rider@example.com")).resolves.toEqual({ isPro: false, expiresAt: null, daysRemaining: null });
  });

  it("rounds a partial day up, not down - a few hours left still reads as 1 day left, not 0", async () => {
    mocks.getUserDoc.mockResolvedValue({
      email: "rider@example.com",
      plan: { grantedAt: "2025-01-01T00:00:00.000Z", expiresAt: new Date(Date.now() + 5 * 3_600_000).toISOString() },
    });
    const result = await getProStatus("rider@example.com");
    expect(result.isPro).toBe(true);
    expect(result.daysRemaining).toBe(1);
  });

  it("returns the real expiresAt and a matching whole-day count for a plan several days out", async () => {
    const expiresAt = new Date(Date.now() + 10 * 86_400_000).toISOString();
    mocks.getUserDoc.mockResolvedValue({
      email: "rider@example.com",
      plan: { grantedAt: "2025-01-01T00:00:00.000Z", expiresAt },
    });
    const result = await getProStatus("rider@example.com");
    expect(result.isPro).toBe(true);
    expect(result.expiresAt).toBe(expiresAt);
    expect(result.daysRemaining).toBe(10);
  });

  it("fails closed with nulls if the underlying lookup throws", async () => {
    mocks.getUserDoc.mockRejectedValue(new Error("Cosmos unavailable"));
    await expect(getProStatus("rider@example.com")).resolves.toEqual({ isPro: false, expiresAt: null, daysRemaining: null });
  });
});
