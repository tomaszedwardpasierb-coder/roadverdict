import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUkFuelPrices: vi.fn() }));

vi.mock("@/lib/fuelPrice", () => ({ getCurrentUkFuelPrices: mocks.getCurrentUkFuelPrices }));

import { GET } from "@/app/api/fuel-price/route";

beforeEach(() => {
  mocks.getCurrentUkFuelPrices.mockReset();
});

describe("GET /api/fuel-price", () => {
  it("answers anyone with this week's UK averages, their week and where they're from", async () => {
    mocks.getCurrentUkFuelPrices.mockResolvedValue({
      petrol: { pencePerLitre: 133.19, weekCommencing: "22/09/2026" },
      diesel: { pencePerLitre: 139.46, weekCommencing: "22/09/2026" },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      petrol: { pencePerLitre: 133.19, weekCommencing: "22/09/2026" },
      diesel: { pencePerLitre: 139.46, weekCommencing: "22/09/2026" },
      source: "DESNZ weekly road fuel prices",
      sourceUrl: "https://www.gov.uk/government/statistics/weekly-road-fuel-prices",
    });
  });

  it("lets shared caches keep it, since it's the same for everyone and changes weekly", async () => {
    mocks.getCurrentUkFuelPrices.mockResolvedValue({
      petrol: { pencePerLitre: 133.19, weekCommencing: "22/09/2026" },
      diesel: { pencePerLitre: 139.46, weekCommencing: "22/09/2026" },
    });
    const cacheControl = (await GET()).headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("s-maxage=3600");
  });
});
