// Mirrors motHistoryFetch.test.ts's conventions for a VDG package fetcher.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.stubGlobal("fetch", mocks.fetch);

import { fetchVdiCheckFromVdg } from "@/lib/tracker/vdiCheckFetch";

function vdgSuccess(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: { IsSuccessStatusCode: true },
        Results: {
          VehicleDetails: {
            VehicleIdentification: {
              DateFirstRegisteredInUk: "2010-12-11T00:00:00Z",
              DateOfManufacture: "2010-12-11T00:00:00Z",
            },
            VehicleStatus: {
              VehicleExciseDutyDetails: {
                VedRate: { FirstYear: { TwelveMonths: 405 }, Standard: { SixMonths: 68.75, TwelveMonths: 200 } },
              },
            },
            VehicleHistory: {
              ColourDetails: { CurrentColour: "SILVER", OriginalColour: "SILVER", NumberOfColourChanges: 0 },
              KeeperChangeList: [{ KeeperStartDate: "2025-11-12T00:00:00Z", PreviousKeeperDisposalDate: null }],
              PlateChangeList: [{ CurrentVrm: "AS3527", PreviousVrm: "PN74XSA", DateOfTransaction: "2020-05-15T00:00:00Z" }],
              V5cCertificateList: [{ IssueDate: "2024-09-07T00:00:00Z" }, { IssueDate: "2025-11-12T00:00:00Z" }],
            },
            DvlaTechnicalDetails: { MassInServiceKg: 202 },
          },
          ModelDetails: {
            ModelClassification: { TaxationClass: "L3" },
            AdditionalInformation: {
              VehicleWarrantyInformation: { ManufacturerWarrantyMiles: 37282, ManufacturerWarrantyMonths: 24 },
            },
            Emissions: { SoundLevels: { StationaryDb: 90, DriveByDb: 79, EngineSpeedRpm: 4200 } },
            Performance: { Power: { Bhp: 71 } },
          },
          PncDetails: { IsStolen: false },
          MiaftrDetails: { WriteOffRecordList: [] },
          FinanceDetails: {
            FinanceRecordList: [
              { AgreementDate: "2024-09-02T00:00:00", AgreementType: "HIRE PURCHASE", FinanceCompany: "LEXUS FINANCIAL SERVICES" },
            ],
          },
          MileageCheckDetails: { CalculatedAverageAnnualMileage: 1120, AverageMileageForAge: 16000, MileageAnomalyDetected: false },
          ...overrides,
        },
      }),
  };
}

beforeEach(() => {
  mocks.fetch.mockReset();
});

describe("fetchVdiCheckFromVdg", () => {
  it("fails soft to null when the fetch itself throws", async () => {
    mocks.fetch.mockRejectedValue(new Error("network error"));
    expect(await fetchVdiCheckFromVdg("AS3527", "test-key")).toBeNull();
  });

  it("fails soft to null when res.json() throws (malformed response body)", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: () => Promise.reject(new Error("bad json")) });
    expect(await fetchVdiCheckFromVdg("AS3527", "test-key")).toBeNull();
  });

  it("returns null when VDG reports no success status", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ResponseInformation: { IsSuccessStatusCode: false }, Results: {} }),
    });
    expect(await fetchVdiCheckFromVdg("AS3527", "test-key")).toBeNull();
  });

  it("parses a real success response into the shaped result", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    const result = await fetchVdiCheckFromVdg("AS3527", "test-key");
    expect(result).toEqual({
      isStolen: false,
      hasWriteOffRecord: false,
      writeOffRecordCount: 0,
      hasOutstandingFinance: true,
      financeRecords: [{ agreementDate: "2024-09-02T00:00:00", agreementType: "HIRE PURCHASE", financeCompany: "LEXUS FINANCIAL SERVICES" }],
      keeperChanges: [{ keeperStartDate: "2025-11-12T00:00:00Z", previousKeeperDisposalDate: null }],
      keeperChangeCount: 1,
      plateChangeCount: 1,
      colourChangeCount: 0,
      currentColour: "SILVER",
      vedFirstYearTwelveMonths: 405,
      vedStandardTwelveMonths: 200,
      v5cReissueCount: 2,
      calculatedAverageAnnualMileage: 1120,
      averageMileageForAge: 16000,
      mileageAnomalyDetected: false,
      manufacturerWarrantyMiles: 37282,
      manufacturerWarrantyMonths: 24,
      writeOffRecords: [],
      plateChanges: [{ currentVrm: "AS3527", previousVrm: "PN74XSA", dateOfTransaction: "2020-05-15T00:00:00Z" }],
      originalColour: "SILVER",
      dateFirstRegisteredInUk: "2010-12-11T00:00:00Z",
      dateOfManufacture: "2010-12-11T00:00:00Z",
      vedStandardSixMonths: 68.75,
      massInServiceKg: 202,
      taxationClass: "L3",
      bhp: 71,
      soundLevels: { stationaryDb: 90, driveByDb: 79, engineSpeedRpm: 4200 },
    });
  });

  it("flags a stolen marker and a write-off record when present", async () => {
    mocks.fetch.mockResolvedValue(
      vdgSuccess({
        PncDetails: { IsStolen: true },
        MiaftrDetails: { WriteOffRecordList: [{ Category: "S" }] },
        FinanceDetails: { FinanceRecordList: [] },
      })
    );
    const result = await fetchVdiCheckFromVdg("AS3527", "test-key");
    expect(result?.isStolen).toBe(true);
    expect(result?.hasWriteOffRecord).toBe(true);
    expect(result?.writeOffRecordCount).toBe(1);
    expect(result?.hasOutstandingFinance).toBe(false);
  });

  // A real MIAFTR write-off record - status/category/insurer detail,
  // not just a bare count (see the DU60OAL sample this was built from).
  it("parses full write-off record detail (status, category, insurer, loss date)", async () => {
    mocks.fetch.mockResolvedValue(
      vdgSuccess({
        MiaftrDetails: {
          WriteOffRecordList: [
            {
              Status: "CAT N NON STRUCTURAL DAMAGE",
              Category: "N",
              LossDate: "2025-08-11T00:00:00Z",
              InsurerName: "4th Dimension Innovation Ltd",
              InsurerCode: "560",
            },
          ],
        },
      })
    );
    const result = await fetchVdiCheckFromVdg("AS3527", "test-key");
    expect(result?.writeOffRecords).toEqual([
      {
        status: "CAT N NON STRUCTURAL DAMAGE",
        category: "N",
        lossDate: "2025-08-11T00:00:00Z",
        insurerName: "4th Dimension Innovation Ltd",
        insurerCode: "560",
      },
    ]);
  });

  it("defaults every count/flag safely when the nested detail blocks are entirely absent", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ResponseInformation: { IsSuccessStatusCode: true }, Results: {} }),
    });
    const result = await fetchVdiCheckFromVdg("AS3527", "test-key");
    expect(result).toEqual({
      isStolen: false,
      hasWriteOffRecord: false,
      writeOffRecordCount: 0,
      hasOutstandingFinance: false,
      financeRecords: [],
      keeperChanges: [],
      keeperChangeCount: 0,
      plateChangeCount: 0,
      colourChangeCount: 0,
      currentColour: null,
      vedFirstYearTwelveMonths: null,
      vedStandardTwelveMonths: null,
      v5cReissueCount: 0,
      calculatedAverageAnnualMileage: null,
      averageMileageForAge: null,
      mileageAnomalyDetected: false,
      manufacturerWarrantyMiles: null,
      manufacturerWarrantyMonths: null,
      writeOffRecords: [],
      plateChanges: [],
      originalColour: null,
      dateFirstRegisteredInUk: null,
      dateOfManufacture: null,
      vedStandardSixMonths: null,
      massInServiceKg: null,
      taxationClass: null,
      bhp: null,
      soundLevels: null,
    });
  });

  it("hits the VDG endpoint with the VDICheck package, the given API key, and a URL-encoded VRM", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    await fetchVdiCheckFromVdg("AS 3527", "test-key");
    const url = mocks.fetch.mock.calls[0][0] as string;
    expect(url).toContain("https://uk.api.vehicledataglobal.com/r2/lookup");
    expect(url).toContain("packageName=VDICheck");
    expect(url).toContain("apiKey=test-key");
    expect(url).toContain(encodeURIComponent("AS 3527"));
  });
});
