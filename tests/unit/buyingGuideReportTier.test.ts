import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isPro: vi.fn(),
  getUserDoc: vi.fn(),
  getBikesForUser: vi.fn(),
  countActiveBikes: vi.fn(),
  getCarsForUser: vi.fn(),
  countActiveCars: vi.fn(),
  canRunFreeVehicleHistoryReport: vi.fn(),
  nextFreeVehicleHistoryReportAt: vi.fn(),
}));

vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/tracker/bike", () => ({ getBikesForUser: mocks.getBikesForUser, countActiveBikes: mocks.countActiveBikes }));
vi.mock("@/lib/tracker/car", () => ({ getCarsForUser: mocks.getCarsForUser, countActiveCars: mocks.countActiveCars }));
vi.mock("@/lib/tracker/vehicleHistoryReportUsage", () => ({
  canRunFreeVehicleHistoryReport: mocks.canRunFreeVehicleHistoryReport,
  nextFreeVehicleHistoryReportAt: mocks.nextFreeVehicleHistoryReportAt,
}));

import { computeBuyingGuideReportTier } from "@/lib/payments/buyingGuideReportTier";
import { BUYING_GUIDE_REPORT_PRICE_PENCE } from "@/lib/payments/pricing";

const email = "user@example.com";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getBikesForUser.mockResolvedValue([]);
  mocks.getCarsForUser.mockResolvedValue([]);
  mocks.countActiveBikes.mockReturnValue(0);
  mocks.countActiveCars.mockReturnValue(0);
});

describe("computeBuyingGuideReportTier", () => {
  it("returns tier 'pro' with pricePence 0 and proFreeAvailable true when a Pro account still has its free allowance", async () => {
    mocks.isPro.mockResolvedValue(true);
    mocks.getUserDoc.mockResolvedValue({ id: email, pk: email, type: "user", email, createdAt: "x" });
    mocks.canRunFreeVehicleHistoryReport.mockReturnValue(true);

    const result = await computeBuyingGuideReportTier(email);

    expect(result).toEqual({ tier: "pro", pricePence: 0, proFreeAvailable: true, nextFreeAt: null });
  });

  it("returns tier 'pro' with the pro price when a Pro account has used its free allowance", async () => {
    mocks.isPro.mockResolvedValue(true);
    mocks.getUserDoc.mockResolvedValue({ id: email, pk: email, type: "user", email, createdAt: "x" });
    mocks.canRunFreeVehicleHistoryReport.mockReturnValue(false);
    mocks.nextFreeVehicleHistoryReportAt.mockReturnValue("2026-02-01T00:00:00.000Z");

    const result = await computeBuyingGuideReportTier(email);

    expect(result).toEqual({
      tier: "pro",
      pricePence: BUYING_GUIDE_REPORT_PRICE_PENCE.pro,
      proFreeAvailable: false,
      nextFreeAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("returns tier 'freeWithVehicle' when a non-Pro account has at least one active bike or car", async () => {
    mocks.isPro.mockResolvedValue(false);
    mocks.countActiveBikes.mockReturnValue(1);

    const result = await computeBuyingGuideReportTier(email);

    expect(result).toEqual({
      tier: "freeWithVehicle",
      pricePence: BUYING_GUIDE_REPORT_PRICE_PENCE.freeWithVehicle,
      proFreeAvailable: false,
      nextFreeAt: null,
    });
  });

  it("counts bikes and cars combined - a car alone is enough for freeWithVehicle", async () => {
    mocks.isPro.mockResolvedValue(false);
    mocks.countActiveBikes.mockReturnValue(0);
    mocks.countActiveCars.mockReturnValue(1);

    const result = await computeBuyingGuideReportTier(email);

    expect(result.tier).toBe("freeWithVehicle");
  });

  it("returns tier 'freeNoVehicle' when a non-Pro account has no active vehicles at all", async () => {
    mocks.isPro.mockResolvedValue(false);

    const result = await computeBuyingGuideReportTier(email);

    expect(result).toEqual({
      tier: "freeNoVehicle",
      pricePence: BUYING_GUIDE_REPORT_PRICE_PENCE.freeNoVehicle,
      proFreeAvailable: false,
      nextFreeAt: null,
    });
  });
});
