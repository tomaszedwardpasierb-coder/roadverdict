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
      keeperChanges: [{ keeperStartDate: "2025-11-12T00:00:00Z", previousKeeperDisposalDate: null, numberOfPreviousKeepers: null }],
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
      series: null,
      platformName: null,
      countryOfOrigin: null,
      dvlaFuelType: null,
      bodyStyle: null,
      dvlaBodyType: null,
      dvlaWheelPlan: null,
      isImported: false,
      isImportedFromOutsideEu: false,
      isScrapped: false,
      certificateOfDestructionIssued: false,
      euroStatus: null,
      dvlaCo2: null,
      dvlaCo2Band: null,
      kerbWeightKg: null,
      grossCombinedWeightKg: null,
      cylinderArrangement: null,
      numberOfCylinders: null,
      aspiration: null,
      transmissionType: null,
      numberOfGears: null,
      drivingAxle: null,
      fuelTankCapacityLitres: null,
      ps: null,
      torqueNm: null,
      torqueRpm: null,
      zeroToSixtyMph: null,
      zeroToOneHundredKph: null,
      maxSpeedMph: null,
      maxSpeedKph: null,
      fuelEconomy: null,
      previousColour: null,
      pncDetail: null,
      mileageReadings: [],
      powertrainType: null,
      driveType: null,
      manufacturerCo2: null,
      torqueLbFt: null,
      powerKw: null,
      powerRpm: null,
      ncapStarRating: null,
      ncapChildPercent: null,
      ncapAdultPercent: null,
      ncapPedestrianPercent: null,
      ncapSafetyAssistPercent: null,
      isTeslaSuperchargerCompatible: false,
      chargePorts: [],
      batteries: [],
      motors: [],
      evTransmissions: [],
      evMaxChargeInputPowerKw: null,
      evWhPerMile: null,
      evRealRangeMiles: null,
      evRealRangeKm: null,
      evMilesPerChargeHour: null,
      evZeroEmissionMiles: null,
      evRangeTestCycles: [],
    });
  });

  // Identity/technical-spec block, confirmed against a real BMW 640i
  // VDICheck sample (see vdiUnlock.ts's comment on this field group).
  it("parses the car-oriented identity/technical-spec/PNC fields from a real sample shape", async () => {
    mocks.fetch.mockResolvedValue(
      vdgSuccess({
        VehicleDetails: {
          VehicleIdentification: {
            DateFirstRegisteredInUk: "2013-09-10T00:00:00Z",
            DateOfManufacture: "2013-09-10T00:00:00Z",
            DvlaWheelPlan: "2 AXLE RIGID BODY",
            DvlaBodyType: "COUPE",
            DvlaFuelType: "PETROL",
          },
          VehicleStatus: {
            IsImported: false,
            IsImportedFromOutsideEu: false,
            IsScrapped: false,
            CertificateOfDestructionIssued: false,
            VehicleExciseDutyDetails: {
              DvlaCo2: 181,
              DvlaCo2Band: "I",
              VedRate: { FirstYear: { TwelveMonths: 405 }, Standard: { SixMonths: 68.75, TwelveMonths: 200 } },
            },
          },
          VehicleHistory: {
            ColourDetails: { CurrentColour: "BLACK", OriginalColour: "BLACK", PreviousColour: null, NumberOfColourChanges: 0 },
            KeeperChangeList: [{ KeeperStartDate: "2020-01-01T00:00:00Z", PreviousKeeperDisposalDate: null, NumberOfPreviousKeepers: 2 }],
            PlateChangeList: [],
            V5cCertificateList: [],
          },
          DvlaTechnicalDetails: { MassInServiceKg: 1900 },
        },
        ModelDetails: {
          ModelIdentification: { Series: "F13", CountryOfOrigin: "Germany" },
          ModelClassification: { TaxationClass: "PRIVATE/LIGHT GOODS" },
          BodyDetails: { PlatformName: "L6", BodyStyle: "Coupe", FuelTankCapacityLitres: 70 },
          Weights: { KerbWeightKg: 1685, GrossCombinedWeightKg: 2180 },
          AdditionalInformation: { VehicleWarrantyInformation: { ManufacturerWarrantyMiles: null, ManufacturerWarrantyMonths: null } },
          Emissions: { EuroStatus: "5b", SoundLevels: { StationaryDb: null, DriveByDb: null, EngineSpeedRpm: null } },
          Powertrain: {
            IceDetails: { Aspiration: "Turbocharged", CylinderArrangement: "Inline", NumberOfCylinders: 6 },
            Transmission: { TransmissionType: "Automatic", NumberOfGears: 8, DrivingAxle: "Rear" },
          },
          Performance: {
            Power: { Bhp: 315, Ps: 319.5 },
            Torque: { Nm: 450.0, Rpm: 1300 },
            Statistics: { ZeroToSixtyMph: 5.3, ZeroToOneHundredKph: null, MaxSpeedMph: 155, MaxSpeedKph: 250 },
            FuelEconomy: {
              UrbanColdMpg: 26.4,
              ExtraUrbanMpg: 47.1,
              CombinedMpg: 36.2,
              UrbanColdL100Km: 10.7,
              ExtraUrbanL100Km: 6.0,
              CombinedL100Km: 7.8,
            },
          },
        },
        PncDetails: {
          IsStolen: false,
          PoliceForceName: "Metropolitan Police",
          CurrentStatusOnRecord: "Recovered",
          DateReportedStolen: "2021-05-01T00:00:00Z",
          DateRecordAddedToPnc: "2021-05-02T00:00:00Z",
        },
      })
    );
    const result = await fetchVdiCheckFromVdg("PA63ERB", "test-key");

    expect(result?.series).toBe("F13");
    expect(result?.platformName).toBe("L6");
    expect(result?.countryOfOrigin).toBe("Germany");
    expect(result?.dvlaFuelType).toBe("PETROL");
    expect(result?.bodyStyle).toBe("Coupe");
    expect(result?.dvlaBodyType).toBe("COUPE");
    expect(result?.dvlaWheelPlan).toBe("2 AXLE RIGID BODY");
    expect(result?.isImported).toBe(false);
    expect(result?.isImportedFromOutsideEu).toBe(false);
    expect(result?.isScrapped).toBe(false);
    expect(result?.certificateOfDestructionIssued).toBe(false);
    expect(result?.euroStatus).toBe("5b");
    expect(result?.dvlaCo2).toBe(181);
    expect(result?.dvlaCo2Band).toBe("I");
    expect(result?.kerbWeightKg).toBe(1685);
    expect(result?.grossCombinedWeightKg).toBe(2180);
    expect(result?.cylinderArrangement).toBe("Inline");
    expect(result?.numberOfCylinders).toBe(6);
    expect(result?.aspiration).toBe("Turbocharged");
    expect(result?.transmissionType).toBe("Automatic");
    expect(result?.numberOfGears).toBe(8);
    expect(result?.drivingAxle).toBe("Rear");
    expect(result?.fuelTankCapacityLitres).toBe(70);
    expect(result?.ps).toBe(319.5);
    expect(result?.torqueNm).toBe(450.0);
    expect(result?.torqueRpm).toBe(1300);
    expect(result?.zeroToSixtyMph).toBe(5.3);
    expect(result?.zeroToOneHundredKph).toBeNull();
    expect(result?.maxSpeedMph).toBe(155);
    expect(result?.maxSpeedKph).toBe(250);
    expect(result?.fuelEconomy).toEqual({
      urbanColdMpg: 26.4,
      extraUrbanMpg: 47.1,
      combinedMpg: 36.2,
      urbanColdL100Km: 10.7,
      extraUrbanL100Km: 6.0,
      combinedL100Km: 7.8,
    });
    expect(result?.previousColour).toBeNull();
    expect(result?.keeperChanges[0].numberOfPreviousKeepers).toBe(2);
    expect(result?.pncDetail).toEqual({
      policeForceName: "Metropolitan Police",
      currentStatusOnRecord: "Recovered",
      dateReportedStolen: "2021-05-01T00:00:00Z",
      dateRecordAddedToPnc: "2021-05-02T00:00:00Z",
    });
  });

  it("leaves pncDetail null when PNC fields are all absent (a clean record)", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess({ PncDetails: { IsStolen: false } }));
    const result = await fetchVdiCheckFromVdg("AS3527", "test-key");
    expect(result?.pncDetail).toBeNull();
  });

  // Individual mileage readings behind the summary
  // calculatedAverageAnnualMileage/averageMileageForAge figures - kept
  // sorted oldest-first regardless of the order VDG returns them in, for
  // the chart built from this list (VdiMileageChart.tsx).
  it("parses and sorts the individual mileage readings oldest-first, defaulting a missing InSequence to true", async () => {
    mocks.fetch.mockResolvedValue(
      vdgSuccess({
        MileageCheckDetails: {
          CalculatedAverageAnnualMileage: 9000,
          AverageMileageForAge: 8500,
          MileageAnomalyDetected: false,
          MileageResultList: [
            { Mileage: 15000, DateRecorded: "2023-06-01T00:00:00Z", InSequence: true, DataSource: "MOT" },
            { Mileage: 12000, DateRecorded: "2022-06-01T00:00:00Z", InSequence: true, DataSource: "MOT" },
            { Mileage: 11000, DateRecorded: "2021-06-01T00:00:00Z" },
          ],
        },
      })
    );
    const result = await fetchVdiCheckFromVdg("AS3527", "test-key");
    expect(result?.mileageReadings).toEqual([
      { date: "2021-06-01T00:00:00Z", mileage: 11000, inSequence: true, dataSource: null },
      { date: "2022-06-01T00:00:00Z", mileage: 12000, inSequence: true, dataSource: "MOT" },
      { date: "2023-06-01T00:00:00Z", mileage: 15000, inSequence: true, dataSource: "MOT" },
    ]);
  });

  it("flags a reading recorded lower than an earlier one via inSequence: false, without dropping it", async () => {
    mocks.fetch.mockResolvedValue(
      vdgSuccess({
        MileageCheckDetails: {
          MileageResultList: [
            { Mileage: 15000, DateRecorded: "2022-06-01T00:00:00Z", InSequence: true },
            { Mileage: 9000, DateRecorded: "2023-06-01T00:00:00Z", InSequence: false, DataSource: "MOT" },
          ],
        },
      })
    );
    const result = await fetchVdiCheckFromVdg("AS3527", "test-key");
    expect(result?.mileageReadings).toEqual([
      { date: "2022-06-01T00:00:00Z", mileage: 15000, inSequence: true, dataSource: null },
      { date: "2023-06-01T00:00:00Z", mileage: 9000, inSequence: false, dataSource: "MOT" },
    ]);
  });

  it("skips a malformed reading missing its date or mileage, rather than passing through a broken point", async () => {
    mocks.fetch.mockResolvedValue(
      vdgSuccess({
        MileageCheckDetails: {
          MileageResultList: [
            { Mileage: 15000, DateRecorded: "2022-06-01T00:00:00Z" },
            { DateRecorded: "2023-06-01T00:00:00Z" }, // no Mileage
            { Mileage: 9000 }, // no DateRecorded
          ],
        },
      })
    );
    const result = await fetchVdiCheckFromVdg("AS3527", "test-key");
    expect(result?.mileageReadings).toEqual([{ date: "2022-06-01T00:00:00Z", mileage: 15000, inSequence: true, dataSource: null }]);
  });

  it("defaults to an empty mileageReadings array when MileageResultList is absent", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    const result = await fetchVdiCheckFromVdg("AS3527", "test-key");
    expect(result?.mileageReadings).toEqual([]);
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
      series: null,
      platformName: null,
      countryOfOrigin: null,
      dvlaFuelType: null,
      bodyStyle: null,
      dvlaBodyType: null,
      dvlaWheelPlan: null,
      isImported: false,
      isImportedFromOutsideEu: false,
      isScrapped: false,
      certificateOfDestructionIssued: false,
      euroStatus: null,
      dvlaCo2: null,
      dvlaCo2Band: null,
      kerbWeightKg: null,
      grossCombinedWeightKg: null,
      cylinderArrangement: null,
      numberOfCylinders: null,
      aspiration: null,
      transmissionType: null,
      numberOfGears: null,
      drivingAxle: null,
      fuelTankCapacityLitres: null,
      ps: null,
      torqueNm: null,
      torqueRpm: null,
      zeroToSixtyMph: null,
      zeroToOneHundredKph: null,
      maxSpeedMph: null,
      maxSpeedKph: null,
      fuelEconomy: null,
      previousColour: null,
      pncDetail: null,
      mileageReadings: [],
      powertrainType: null,
      driveType: null,
      manufacturerCo2: null,
      torqueLbFt: null,
      powerKw: null,
      powerRpm: null,
      ncapStarRating: null,
      ncapChildPercent: null,
      ncapAdultPercent: null,
      ncapPedestrianPercent: null,
      ncapSafetyAssistPercent: null,
      isTeslaSuperchargerCompatible: false,
      chargePorts: [],
      batteries: [],
      motors: [],
      evTransmissions: [],
      evMaxChargeInputPowerKw: null,
      evWhPerMile: null,
      evRealRangeMiles: null,
      evRealRangeKm: null,
      evMilesPerChargeHour: null,
      evZeroEmissionMiles: null,
      evRangeTestCycles: [],
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

  // EV-specific fields, confirmed against a real Audi e-tron VDICheck
  // sample (WP22FUT) - a dual-motor AWD BEV with 3 charge port entries,
  // a single battery pack, and a WLTP range test cycle.
  describe("EV fields (from a real Audi e-tron sample)", () => {
    function evSuccess(overrides: Record<string, unknown> = {}) {
      return vdgSuccess({
        ModelDetails: {
          Emissions: { EuroStatus: "6", ManufacturerCo2: 0 },
          Safety: { EuroNcap: { NcapStarRating: 5, NcapChildPercent: 85, NcapAdultPercent: 91, NcapPedestrianPercent: 71, NcapSafetyAssistPercent: 76 } },
          Powertrain: {
            PowertrainType: "BEV",
            IceDetails: null,
            EvDetails: {
              TechnicalDetails: {
                IsTeslaSuperchargerCompatible: false,
                ChargePortDetailsList: [
                  {
                    PortType: "Type 2",
                    LocationOnVehicle: "Left/Front",
                    MaxChargePowerKw: 11.0,
                    IsStandardChargePort: true,
                    ChargeTimes: {
                      AverageChargeTimes10To80Percent: [
                        { ChargePortKw: 2.3, TimeInMinutes: 1441 },
                        { ChargePortKw: 7.5, TimeInMinutes: 442 },
                        { ChargePortKw: 11, TimeInMinutes: 301 },
                        { ChargePortKw: 50, TimeInMinutes: null },
                      ],
                    },
                  },
                  {
                    PortType: "CCS",
                    LocationOnVehicle: "Right/Front",
                    MaxChargePowerKw: 120.0,
                    IsStandardChargePort: true,
                    ChargeTimes: {
                      AverageChargeTimes10To80Percent: [
                        { ChargePortKw: 50, TimeInMinutes: 66 },
                        { ChargePortKw: 100, TimeInMinutes: 33 },
                        { ChargePortKw: 150, TimeInMinutes: 28 },
                      ],
                    },
                  },
                ],
                BatteryDetailsList: [
                  {
                    TotalCapacityKwh: 71,
                    UsableCapacityKwh: 64,
                    Chemistry: "Lithium-Ion 375V",
                    LocationOnVehicle: "Under Floor/Middle",
                    ManufacturerWarrantyMonths: 96,
                    ManufacturerWarrantyMiles: 100000,
                  },
                ],
                MotorDetailsList: [
                  {
                    Manufacturer: "Audi",
                    Model: "E-Tron",
                    MotorType: "Permanent magnet synchronous",
                    PowerKw: 215,
                    MaxTorqueNm: 332,
                    SupportsRegenerativeBraking: true,
                    MotorLocation: "Front",
                    AxleDrivenByMotor: "Front",
                    AdditionalInformation: null,
                  },
                  {
                    Manufacturer: "Audi",
                    Model: "E-Tron",
                    MotorType: "Permanent magnet synchronous",
                    PowerKw: 215,
                    MaxTorqueNm: 332,
                    SupportsRegenerativeBraking: true,
                    MotorLocation: "Rear",
                    AxleDrivenByMotor: "Rear",
                    AdditionalInformation: null,
                  },
                ],
                TransmissionDetailsList: [{ TransmissionType: "Automatic", NumberOfGears: 1 }],
              },
              Performance: {
                MaxChargeInputPowerKw: null,
                WhMile: 394,
                RangeFigures: {
                  RealRangeMiles: null,
                  RealRangeKm: null,
                  MilesPerChargeHour: 304,
                  ZeroEmissionMiles: 180,
                  RangeTestCycleList: [{ EvRangeTestType: "WLTP", CombinedRangeMiles: 180, CombinedRangeKm: 289.68, CityRangeMiles: null, CityRangeKm: null }],
                },
              },
            },
            Transmission: { TransmissionType: "Automatic", NumberOfGears: 1, DriveType: "4x4", DrivingAxle: "All Permanent" },
          },
          Performance: {
            Torque: { Nm: 664.0, LbFt: 490.0, Rpm: 5800 },
            Power: { Bhp: 308.4, Ps: 312.7, Kw: 230.0, Rpm: 5800 },
            Statistics: { ZeroToOneHundredKph: 6.8, MaxSpeedKph: 190, MaxSpeedMph: 118 },
            FuelEconomy: { UrbanColdMpg: null, ExtraUrbanMpg: null, CombinedMpg: null, UrbanColdL100Km: null, ExtraUrbanL100Km: null, CombinedL100Km: null },
          },
        },
        ...overrides,
      });
    }

    it("parses powertrainType from the top-level Powertrain object, not EvDetails' own copy", async () => {
      mocks.fetch.mockResolvedValue(evSuccess());
      const result = await fetchVdiCheckFromVdg("WP22FUT", "test-key");
      expect(result?.powertrainType).toBe("BEV");
    });

    it("parses driveType alongside the existing drivingAxle, as a distinct field", async () => {
      mocks.fetch.mockResolvedValue(evSuccess());
      const result = await fetchVdiCheckFromVdg("WP22FUT", "test-key");
      expect(result?.driveType).toBe("4x4");
      expect(result?.drivingAxle).toBe("All Permanent");
    });

    it("parses manufacturerCo2 distinctly from dvlaCo2", async () => {
      mocks.fetch.mockResolvedValue(evSuccess());
      const result = await fetchVdiCheckFromVdg("WP22FUT", "test-key");
      expect(result?.manufacturerCo2).toBe(0);
    });

    it("parses torqueLbFt and powerKw/powerRpm alongside the existing Nm/Bhp/Ps figures", async () => {
      mocks.fetch.mockResolvedValue(evSuccess());
      const result = await fetchVdiCheckFromVdg("WP22FUT", "test-key");
      expect(result?.torqueNm).toBe(664.0);
      expect(result?.torqueLbFt).toBe(490.0);
      expect(result?.bhp).toBe(308.4);
      expect(result?.ps).toBe(312.7);
      expect(result?.powerKw).toBe(230.0);
      expect(result?.powerRpm).toBe(5800);
    });

    it("leaves fuelEconomy null when every one of its sub-fields is null, rather than an empty-but-truthy object", async () => {
      mocks.fetch.mockResolvedValue(evSuccess());
      const result = await fetchVdiCheckFromVdg("WP22FUT", "test-key");
      expect(result?.fuelEconomy).toBeNull();
    });

    it("parses the Euro NCAP safety rating", async () => {
      mocks.fetch.mockResolvedValue(evSuccess());
      const result = await fetchVdiCheckFromVdg("WP22FUT", "test-key");
      expect(result?.ncapStarRating).toBe(5);
      expect(result?.ncapChildPercent).toBe(85);
      expect(result?.ncapAdultPercent).toBe(91);
      expect(result?.ncapPedestrianPercent).toBe(71);
      expect(result?.ncapSafetyAssistPercent).toBe(76);
    });

    it("parses each charge port with its own filtered charge-time table (unreachable kW rates dropped)", async () => {
      mocks.fetch.mockResolvedValue(evSuccess());
      const result = await fetchVdiCheckFromVdg("WP22FUT", "test-key");
      expect(result?.chargePorts).toEqual([
        {
          portType: "Type 2",
          locationOnVehicle: "Left/Front",
          maxChargePowerKw: 11.0,
          isStandardChargePort: true,
          chargeTimes: [
            { chargePortKw: 2.3, timeInMinutes: 1441 },
            { chargePortKw: 7.5, timeInMinutes: 442 },
            { chargePortKw: 11, timeInMinutes: 301 },
          ],
        },
        {
          portType: "CCS",
          locationOnVehicle: "Right/Front",
          maxChargePowerKw: 120.0,
          isStandardChargePort: true,
          chargeTimes: [
            { chargePortKw: 50, timeInMinutes: 66 },
            { chargePortKw: 100, timeInMinutes: 33 },
            { chargePortKw: 150, timeInMinutes: 28 },
          ],
        },
      ]);
      expect(result?.isTeslaSuperchargerCompatible).toBe(false);
    });

    it("parses the battery pack's own capacity/chemistry/warranty, distinct from the vehicle's own warranty", async () => {
      mocks.fetch.mockResolvedValue(evSuccess());
      const result = await fetchVdiCheckFromVdg("WP22FUT", "test-key");
      expect(result?.batteries).toEqual([
        {
          locationOnVehicle: "Under Floor/Middle",
          totalCapacityKwh: 71,
          usableCapacityKwh: 64,
          chemistry: "Lithium-Ion 375V",
          warrantyMonths: 96,
          warrantyMiles: 100000,
        },
      ]);
    });

    it("parses every motor in MotorDetailsList (a dual-motor AWD EV has two)", async () => {
      mocks.fetch.mockResolvedValue(evSuccess());
      const result = await fetchVdiCheckFromVdg("WP22FUT", "test-key");
      expect(result?.motors).toEqual([
        {
          motorType: "Permanent magnet synchronous", manufacturer: "Audi", model: "E-Tron",
          motorLocation: "Front", powerKw: 215, maxTorqueNm: 332, axleDrivenByMotor: "Front",
          supportsRegenerativeBraking: true, additionalInformation: null,
        },
        {
          motorType: "Permanent magnet synchronous", manufacturer: "Audi", model: "E-Tron",
          motorLocation: "Rear", powerKw: 215, maxTorqueNm: 332, axleDrivenByMotor: "Rear",
          supportsRegenerativeBraking: true, additionalInformation: null,
        },
      ]);
    });

    it("parses the EV-specific TransmissionDetailsList separately from the existing top-level Transmission fields", async () => {
      mocks.fetch.mockResolvedValue(evSuccess());
      const result = await fetchVdiCheckFromVdg("WP22FUT", "test-key");
      expect(result?.evTransmissions).toEqual([{ transmissionType: "Automatic", numberOfGears: 1 }]);
      // The existing top-level fields still parse from Transmission itself, unaffected.
      expect(result?.transmissionType).toBe("Automatic");
      expect(result?.numberOfGears).toBe(1);
    });

    it("parses EV performance/range figures, including the WLTP range test cycle list", async () => {
      mocks.fetch.mockResolvedValue(evSuccess());
      const result = await fetchVdiCheckFromVdg("WP22FUT", "test-key");
      expect(result?.evWhPerMile).toBe(394);
      expect(result?.evMaxChargeInputPowerKw).toBeNull();
      expect(result?.evMilesPerChargeHour).toBe(304);
      expect(result?.evZeroEmissionMiles).toBe(180);
      expect(result?.evRealRangeMiles).toBeNull();
      expect(result?.evRangeTestCycles).toEqual([
        { testType: "WLTP", combinedRangeMiles: 180, combinedRangeKm: 289.68, cityRangeMiles: null, cityRangeKm: null },
      ]);
    });

    it("defaults every EV field safely for a combustion car with no EvDetails/EuroNcap block at all", async () => {
      mocks.fetch.mockResolvedValue(vdgSuccess());
      const result = await fetchVdiCheckFromVdg("AS3527", "test-key");
      expect(result?.powertrainType).toBeNull();
      expect(result?.isTeslaSuperchargerCompatible).toBe(false);
      expect(result?.chargePorts).toEqual([]);
      expect(result?.batteries).toEqual([]);
      expect(result?.motors).toEqual([]);
      expect(result?.evTransmissions).toEqual([]);
      expect(result?.evRangeTestCycles).toEqual([]);
      expect(result?.ncapStarRating).toBeNull();
    });
  });
});
