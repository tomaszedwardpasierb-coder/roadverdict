import { beforeEach, describe, expect, it, vi } from "vitest";

// Unlike buyingGuideReportTier.test.ts, this leaves the real
// vehicleHistoryReportUsage module in place, so it proves the whole chain a
// Pro account's report price comes from - including the tester exclusion.
const mocks = vi.hoisted(() => ({ isPro: vi.fn(), getUserDoc: vi.fn() }));

vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/tracker/bike", () => ({ getBikesForUser: vi.fn(), countActiveBikes: vi.fn() }));
vi.mock("@/lib/tracker/car", () => ({ getCarsForUser: vi.fn(), countActiveCars: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({ getContainer: () => ({}) }));

import { computeBuyingGuideReportTier } from "@/lib/payments/buyingGuideReportTier";
import { BUYING_GUIDE_REPORT_PRICE_PENCE, PRO_FREE_REPORT_COOLDOWN_MS } from "@/lib/payments/pricing";

const email = "tester@example.com";
const baseUser = { id: email, pk: email, type: "user", email, createdAt: "2026-01-01T00:00:00.000Z" };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.isPro.mockResolvedValue(true);
});

describe("computeBuyingGuideReportTier with the real free-report rules", () => {
  it("gives a Pro account that has never run a report its free one (the control)", async () => {
    mocks.getUserDoc.mockResolvedValue(baseUser);
    expect(await computeBuyingGuideReportTier(email)).toEqual({ tier: "pro", pricePence: 0, proFreeAvailable: true, nextFreeAt: null });
  });

  it("charges a Pro account tagged 'tester' the Pro price and offers no free report or date", async () => {
    mocks.getUserDoc.mockResolvedValue({ ...baseUser, tags: ["tester"] });
    expect(await computeBuyingGuideReportTier(email)).toEqual({
      tier: "pro",
      pricePence: BUYING_GUIDE_REPORT_PRICE_PENCE.pro,
      proFreeAvailable: false,
      nextFreeAt: null,
    });
  });

  it("promises a tester no 'next free' date even if one was used before the tag was added", async () => {
    const lastRunAt = new Date(Date.now() - PRO_FREE_REPORT_COOLDOWN_MS / 2).toISOString();
    mocks.getUserDoc.mockResolvedValue({ ...baseUser, tags: ["tester"], vehicleHistoryReportUsage: { lastRunAt } });
    const result = await computeBuyingGuideReportTier(email);
    expect(result.proFreeAvailable).toBe(false);
    expect(result.nextFreeAt).toBeNull();
  });
});
