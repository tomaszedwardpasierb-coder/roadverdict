// Mirrors motHistoryFetch.test.ts's conventions for a VDG package fetcher.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.stubGlobal("fetch", mocks.fetch);

import { fetchVehicleTaxDetailsFromVdg } from "@/lib/tracker/vehicleTaxFetch";

function vdgSuccess(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: { StatusCode: 0, IsSuccessStatusCode: true },
        Results: {
          VehicleTaxDetails: {
            Vrm: "RO22WTA",
            Make: "BENELLI",
            MotStatus: "Valid",
            TaxDueDate: "2027-06-01T00:00:00",
            TaxStatus: "Taxed",
            TaxIsCurrentlyValid: true,
            TaxDaysRemaining: 263,
            VehicleExciseDutyDetails: { VedRate: { Standard: { TwelveMonths: 27 } } },
            ...overrides,
          },
        },
      }),
  };
}

beforeEach(() => {
  mocks.fetch.mockReset();
});

describe("fetchVehicleTaxDetailsFromVdg", () => {
  it("fails soft to null when the fetch itself throws", async () => {
    mocks.fetch.mockRejectedValue(new Error("network error"));
    expect(await fetchVehicleTaxDetailsFromVdg("RO22WTA", "test-key")).toBeNull();
  });

  it("fails soft to null when res.json() throws (malformed response body)", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: () => Promise.reject(new Error("bad json")) });
    expect(await fetchVehicleTaxDetailsFromVdg("RO22WTA", "test-key")).toBeNull();
  });

  it("returns null when VDG reports no success status", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ResponseInformation: { IsSuccessStatusCode: false }, Results: {} }),
    });
    expect(await fetchVehicleTaxDetailsFromVdg("RO22WTA", "test-key")).toBeNull();
  });

  it("returns null when the success flag is true but VehicleTaxDetails itself is missing", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ResponseInformation: { IsSuccessStatusCode: true }, Results: {} }),
    });
    expect(await fetchVehicleTaxDetailsFromVdg("RO22WTA", "test-key")).toBeNull();
  });

  it("parses a real success response into the shaped result", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    const result = await fetchVehicleTaxDetailsFromVdg("RO22WTA", "test-key");
    expect(result).toEqual({
      make: "BENELLI",
      taxStatus: "Taxed",
      taxIsCurrentlyValid: true,
      taxDueDate: "2027-06-01T00:00:00",
      taxDaysRemaining: 263,
      motStatus: "Valid",
      vedStandardTwelveMonths: 27,
    });
  });

  it("defaults every field safely when the nested detail blocks are absent", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ResponseInformation: { IsSuccessStatusCode: true }, Results: { VehicleTaxDetails: {} } }),
    });
    const result = await fetchVehicleTaxDetailsFromVdg("RO22WTA", "test-key");
    expect(result).toEqual({
      make: null,
      taxStatus: null,
      taxIsCurrentlyValid: false,
      taxDueDate: null,
      taxDaysRemaining: null,
      motStatus: null,
      vedStandardTwelveMonths: null,
    });
  });

  it("hits the VDG endpoint with the VehicleTaxDetails package, the given API key, and a URL-encoded VRM", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    await fetchVehicleTaxDetailsFromVdg("RO22 WTA", "test-key");
    const url = mocks.fetch.mock.calls[0][0] as string;
    expect(url).toContain("https://uk.api.vehicledataglobal.com/r2/lookup");
    expect(url).toContain("packageName=VehicleTaxDetails");
    expect(url).toContain("apiKey=test-key");
    expect(url).toContain(encodeURIComponent("RO22 WTA"));
  });
});
