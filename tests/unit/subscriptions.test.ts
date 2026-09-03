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

import { isPro } from "@/lib/subscriptions";

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
