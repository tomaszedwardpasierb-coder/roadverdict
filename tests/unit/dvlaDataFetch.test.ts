import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.stubGlobal("fetch", mocks.fetch);

import { fetchDvlaDataFromVdg } from "@/lib/tracker/dvlaDataFetch";

function vdgSuccess(overrides: {
  vd?: Record<string, any>;
  md?: Record<string, any>;
} = {}) {
  const vd = {
    VehicleIdentification: { Vrm: "AB20YAM", DateFirstRegistered: "2020-03-01" },
    VehicleStatus: {
      IsImported: false, IsExported: false, IsScrapped: false,
      IsUnscrapped: false, DvlaCherishedTransferMarker: false,
    },
    VehicleHistory: {
      KeeperChangeList: [],
      PlateChangeList: [],
      V5cCertificateList: [],
    },
    ...overrides.vd,
  };
  const md = {
    Performance: { FuelEconomy: { CombinedMpg: 55 }, Power: { Bhp: 73, Rpm: 8000 }, Torque: { Nm: 68 } },
    Emissions: { EuroStatus: "Euro 5" },
    BodyDetails: { FuelTankCapacityLitres: 14 },
    ModelIdentification: { CountryOfOrigin: "Japan" },
    AdditionalInformation: { VehicleWarrantyInformation: { ManufacturerWarrantyMonths: 24, ManufacturerWarrantyMiles: 36000 } },
    ...overrides.md,
  };
  return {
    ok: true,
    json: () => Promise.resolve({
      ResponseInformation: { IsSuccessStatusCode: true },
      Results: { VehicleDetails: vd, ModelDetails: md },
    }),
  };
}

beforeEach(() => {
  mocks.fetch.mockReset();
  process.env.VDG_API_KEY = "test-key";
});

describe("fetchDvlaDataFromVdg", () => {
  it("returns null when VDG_API_KEY is not set", async () => {
    delete process.env.VDG_API_KEY;
    const result = await fetchDvlaDataFromVdg("AB20YAM");
    expect(result).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns null when the fetch throws", async () => {
    mocks.fetch.mockRejectedValue(new Error("network error"));
    const result = await fetchDvlaDataFromVdg("AB20YAM");
    expect(result).toBeNull();
  });

  it("returns null when VDG reports no vehicle found", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ResponseInformation: { IsSuccessStatusCode: false }, Results: {} }),
    });
    const result = await fetchDvlaDataFromVdg("AB20YAM");
    expect(result).toBeNull();
  });

  it("returns a well-formed DvlaVehicleData object on success", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    const result = await fetchDvlaDataFromVdg("AB20YAM");
    expect(result).toMatchObject({
      dvlaCurrentVrm: "AB20YAM",
      dateFirstRegistered: "2020-03-01",
      officialCombinedMpg: 55,
      euroStatus: "Euro 5",
      fuelTankCapacityLitres: 14,
      powerBhp: 73,
      torqueNm: 68,
      countryOfOrigin: "Japan",
      warrantyMonths: 24,
      warrantyMiles: 36000,
    });
  });

  it("sets fetchedAt to a current ISO timestamp", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    const before = Date.now();
    const result = await fetchDvlaDataFromVdg("AB20YAM");
    const after = Date.now();
    expect(new Date(result!.fetchedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(result!.fetchedAt).getTime()).toBeLessThanOrEqual(after);
  });

  it("maps keeper change list correctly", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess({
      vd: {
        VehicleHistory: {
          KeeperChangeList: [{ NumberOfPreviousKeepers: 1, KeeperStartDate: "2022-01-01", PreviousKeeperDisposalDate: "2021-12-31" }],
          PlateChangeList: [],
          V5cCertificateList: [],
        },
      },
    }));
    const result = await fetchDvlaDataFromVdg("AB20YAM");
    expect(result?.keeperChangeList).toEqual([{
      numberOfPreviousKeepers: 1,
      keeperStartDate: "2022-01-01",
      previousKeeperDisposalDate: "2021-12-31",
    }]);
  });

  it("maps plate change list correctly", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess({
      vd: {
        VehicleHistory: {
          KeeperChangeList: [],
          PlateChangeList: [{ CurrentVrm: "AB20YAM", PreviousVrm: "OLD123", DateOfTransaction: "2021-06-01" }],
          V5cCertificateList: [],
        },
      },
    }));
    const result = await fetchDvlaDataFromVdg("AB20YAM");
    expect(result?.plateChangeList).toEqual([{
      currentVrm: "AB20YAM",
      previousVrm: "OLD123",
      dateOfTransaction: "2021-06-01",
    }]);
  });

  it("maps V5C issue dates correctly", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess({
      vd: {
        VehicleHistory: {
          KeeperChangeList: [],
          PlateChangeList: [],
          V5cCertificateList: [{ IssueDate: "2020-04-01" }, { IssueDate: "2022-08-15" }],
        },
      },
    }));
    const result = await fetchDvlaDataFromVdg("AB20YAM");
    expect(result?.v5cIssueDates).toEqual(["2020-04-01", "2022-08-15"]);
  });

  it("handles absent ModelDetails gracefully (returns undefined for those fields)", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ResponseInformation: { IsSuccessStatusCode: true },
        Results: {
          VehicleDetails: {
            VehicleIdentification: { Vrm: "AB20YAM" },
            VehicleStatus: {},
            VehicleHistory: { KeeperChangeList: [], PlateChangeList: [], V5cCertificateList: [] },
          },
          // ModelDetails absent
        },
      }),
    });
    const result = await fetchDvlaDataFromVdg("AB20YAM");
    expect(result?.officialCombinedMpg).toBeUndefined();
    expect(result?.powerBhp).toBeUndefined();
  });

  it("includes the VRM in the VDG request URL", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    await fetchDvlaDataFromVdg("XY99ZZZ");
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("XY99ZZZ"));
  });
});
