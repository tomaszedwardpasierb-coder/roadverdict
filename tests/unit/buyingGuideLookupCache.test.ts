import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
const mockContainer = {
  item: vi.fn(() => ({ read: mocks.read })),
  items: { upsert: mocks.upsert },
};
vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import { getCachedBuyingGuideLookup, setCachedBuyingGuideLookup, type CachedBuyingGuideLookupData } from "@/lib/tracker/buyingGuideLookupCache";
import { VDI_PURCHASE_RETRIEVAL_WINDOW_MS } from "@/lib/tracker/vdiPurchase";

const sampleData: CachedBuyingGuideLookupData = {
  make: "Ford",
  model: "Focus",
  fuelType: "Petrol",
  colour: "Blue",
  plateInRetention: false,
  motDueDate: "2026-01-01",
  motTestsOldestFirst: [{ testDate: "2025-01-01", passed: true, mileage: 30000, mileageTrusted: true, notes: "" }],
  taxDetails: { make: "Ford", taxStatus: "Taxed", taxIsCurrentlyValid: true, taxDueDate: null, taxDaysRemaining: null, motStatus: "Valid", vedStandardTwelveMonths: 190 },
  briefing: { motFlags: [], modelNotes: [], summary: "Looks clean." },
};

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
});

describe("getCachedBuyingGuideLookup", () => {
  it("returns null when nothing is cached for this plate", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await getCachedBuyingGuideLookup("car", "AB12CDE")).toBeNull();
  });

  it("returns the cached data when still within the cache window", async () => {
    mocks.read.mockResolvedValue({
      resource: { id: "x", pk: "system", type: "buyingGuideLookupCache", vehicleKind: "car", vrm: "AB12CDE", cachedAt: new Date().toISOString(), data: sampleData },
    });
    expect(await getCachedBuyingGuideLookup("car", "AB12CDE")).toEqual(sampleData);
  });

  it("returns null once the cache entry has expired", async () => {
    mocks.read.mockResolvedValue({
      resource: {
        id: "x",
        pk: "system",
        type: "buyingGuideLookupCache",
        vehicleKind: "car",
        vrm: "AB12CDE",
        cachedAt: new Date(Date.now() - VDI_PURCHASE_RETRIEVAL_WINDOW_MS - 1000).toISOString(),
        data: sampleData,
      },
    });
    expect(await getCachedBuyingGuideLookup("car", "AB12CDE")).toBeNull();
  });

  it("fails soft to null if the read throws", async () => {
    mocks.read.mockRejectedValue(new Error("not found"));
    expect(await getCachedBuyingGuideLookup("car", "AB12CDE")).toBeNull();
  });

  it("keys the lookup by both vehicle kind and plate, not plate alone", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await getCachedBuyingGuideLookup("bike", "AB12CDE");
    expect(mockContainer.item).toHaveBeenCalledWith("buyingGuideLookupCache::bike::AB12CDE", "system");
  });
});

describe("setCachedBuyingGuideLookup", () => {
  it("upserts a doc keyed by vehicle kind and plate, with a fresh cachedAt", async () => {
    const before = Date.now();
    await setCachedBuyingGuideLookup("car", "AB12CDE", sampleData);
    const saved = mocks.upsert.mock.calls[0][0];
    expect(saved.id).toBe("buyingGuideLookupCache::car::AB12CDE");
    expect(saved.pk).toBe("system");
    expect(saved.vehicleKind).toBe("car");
    expect(saved.vrm).toBe("AB12CDE");
    expect(saved.data).toEqual(sampleData);
    expect(new Date(saved.cachedAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});
