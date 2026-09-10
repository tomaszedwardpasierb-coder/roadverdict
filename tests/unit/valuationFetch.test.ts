// Mirrors motHistoryFetch.test.ts's conventions for a VDG package fetcher.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.stubGlobal("fetch", mocks.fetch);

import { fetchValuationFromVdg } from "@/lib/tracker/valuationFetch";

function vdgSuccess(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: { StatusCode: 0, IsSuccessStatusCode: true },
        Results: {
          ValuationDetails: {
            ValuationTime: "2026-09-10T08:26:58.9412687Z",
            ValuationMileage: 23627,
            VehicleDescription: "Lexus LBX Takumi CVT Takumi [Petrol/Electric / CVT]",
            ValuationFigures: {
              OnTheRoad: 38015,
              DealerForecourt: 27161,
              TradeRetail: 26240,
              PrivateClean: 24257,
              PrivateAverage: 23994,
              PartExchange: 23880,
              Auction: 23866,
              TradeAverage: 23060,
              TradePoor: 21471,
            },
            ...overrides,
          },
        },
      }),
  };
}

beforeEach(() => {
  mocks.fetch.mockReset();
});

describe("fetchValuationFromVdg", () => {
  it("fails soft to null when the fetch itself throws", async () => {
    mocks.fetch.mockRejectedValue(new Error("network error"));
    expect(await fetchValuationFromVdg("AS3527", "test-key")).toBeNull();
  });

  it("fails soft to null when res.json() throws (malformed response body)", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: () => Promise.reject(new Error("bad json")) });
    expect(await fetchValuationFromVdg("AS3527", "test-key")).toBeNull();
  });

  it("returns null when VDG reports no success status", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ResponseInformation: { IsSuccessStatusCode: false }, Results: {} }),
    });
    expect(await fetchValuationFromVdg("AS3527", "test-key")).toBeNull();
  });

  it("returns null when the success flag is true but ValuationDetails itself is missing", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ResponseInformation: { IsSuccessStatusCode: true }, Results: {} }),
    });
    expect(await fetchValuationFromVdg("AS3527", "test-key")).toBeNull();
  });

  it("parses a real success response into the shaped result", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    const result = await fetchValuationFromVdg("AS3527", "test-key");
    expect(result).toEqual({
      valuationTime: "2026-09-10T08:26:58.9412687Z",
      valuationMileage: 23627,
      vehicleDescription: "Lexus LBX Takumi CVT Takumi [Petrol/Electric / CVT]",
      onTheRoad: 38015,
      dealerForecourt: 27161,
      tradeRetail: 26240,
      privateClean: 24257,
      privateAverage: 23994,
      partExchange: 23880,
      auction: 23866,
      tradeAverage: 23060,
      tradePoor: 21471,
    });
  });

  it("defaults every figure to null when ValuationFigures itself is absent", async () => {
    mocks.fetch.mockResolvedValue(
      vdgSuccess({ ValuationFigures: undefined })
    );
    const result = await fetchValuationFromVdg("AS3527", "test-key");
    expect(result).toMatchObject({
      onTheRoad: null,
      dealerForecourt: null,
      tradeRetail: null,
      privateClean: null,
      privateAverage: null,
      partExchange: null,
      auction: null,
      tradeAverage: null,
      tradePoor: null,
    });
  });

  it("hits the VDG endpoint with the ValuationDetails package, the given API key, and a URL-encoded VRM", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    await fetchValuationFromVdg("AS 3527", "test-key");
    const url = mocks.fetch.mock.calls[0][0] as string;
    expect(url).toContain("https://uk.api.vehicledataglobal.com/r2/lookup");
    expect(url).toContain("packageName=ValuationDetails");
    expect(url).toContain("apiKey=test-key");
    expect(url).toContain(encodeURIComponent("AS 3527"));
  });
});
