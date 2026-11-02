// The DVSA client (dvsaMot.ts) and the switch in front of it
// (motHistorySource.ts): DVSA first when MOT_SOURCE=dvsa, VDG when DVSA is
// down, a plate DVSA doesn't know is "not found" without paying VDG, and
// DVSA's answer arrives in VDG's shape so every caller reads it unchanged.
// The DVSA bodies below follow a real response's fields (2 Nov 2026).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.stubGlobal("fetch", mocks.fetch);

import { fetchMotHistoryDetails, motSource } from "@/lib/mot/motHistorySource";
import { dvsaToMotHistoryDetails, resetDvsaTokenCache, type DvsaVehicle } from "@/lib/mot/dvsaMot";
import { parseMotHistory } from "@/lib/tracker/motHistory";

const DVSA_ENV = {
  DVSA_MOT_CLIENT_ID: "client",
  DVSA_MOT_CLIENT_SECRET: "secret",
  DVSA_MOT_API_KEY: "api-key",
  DVSA_MOT_SCOPE: "https://tapi.dvsa.gov.uk/.default",
  DVSA_MOT_TOKEN_URL: "https://login.example/token",
};

const VEHICLE: DvsaVehicle = {
  registration: "AB12CDE",
  make: "VAUXHALL",
  model: "ASTRA",
  fuelType: "Petrol",
  primaryColour: "White",
  engineSize: "1399",
  firstUsedDate: "2017-06-19",
  hasOutstandingRecall: "Unknown",
  motTests: [
    {
      completedDate: "2025-09-04T14:18:47.000Z",
      testResult: "PASSED",
      expiryDate: "2026-09-12",
      odometerValue: "117153",
      odometerUnit: "MI",
      odometerResultType: "READ",
      defects: [{ dangerous: false, text: "Nearside Front Tyre worn close to legal limit (5.2.3 (e))", type: "ADVISORY" }],
    },
    {
      completedDate: "2024-09-12T07:59:27.000Z",
      testResult: "FAILED",
      odometerValue: "106691",
      odometerUnit: "MI",
      odometerResultType: "READ",
      defects: [{ dangerous: true, text: "Brake pipe corroded", type: "DANGEROUS" }],
    },
    {
      completedDate: "2023-09-01T10:00:00.000Z",
      testResult: "PASSED",
      expiryDate: "2024-09-12",
      odometerValue: "95000",
      odometerUnit: "MI",
      odometerResultType: "UNREADABLE",
      defects: [],
    },
  ],
};

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

function vdgFound() {
  return json(200, {
    ResponseInformation: { IsSuccessStatusCode: true, StatusCode: 0 },
    Results: { MotHistoryDetails: { Make: "FORD", Model: "FIESTA", FuelType: "Petrol", Colour: "Blue", MotDueDate: "2026-05-01", MotTestDetailsList: [] } },
  });
}

// Token, then the vehicle - routed by URL so call order doesn't matter.
function routeDvsa(vehicleResponse: ReturnType<typeof json> | Error) {
  mocks.fetch.mockImplementation((url: string) => {
    if (url === DVSA_ENV.DVSA_MOT_TOKEN_URL) return Promise.resolve(json(200, { access_token: "tok", expires_in: 3599 }));
    if (url.startsWith("https://history.mot.api.gov.uk/")) {
      return vehicleResponse instanceof Error ? Promise.reject(vehicleResponse) : Promise.resolve(vehicleResponse);
    }
    if (url.startsWith("https://uk.api.vehicledataglobal.com/")) return Promise.resolve(vdgFound());
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

const vdgCalls = () => mocks.fetch.mock.calls.filter(([url]) => String(url).includes("vehicledataglobal")).length;

beforeEach(() => {
  mocks.fetch.mockReset();
  resetDvsaTokenCache();
  process.env.VDG_API_KEY = "vdg-key";
  Object.assign(process.env, DVSA_ENV);
  process.env.MOT_SOURCE = "dvsa";
});

afterEach(() => {
  for (const k of [...Object.keys(DVSA_ENV), "MOT_SOURCE"]) delete process.env[k];
});

describe("motSource", () => {
  it("is dvsa only when MOT_SOURCE says so AND every DVSA setting is present", () => {
    expect(motSource()).toBe("dvsa");
    delete process.env.DVSA_MOT_API_KEY;
    expect(motSource()).toBe("vdg");
  });

  it("is vdg when MOT_SOURCE is unset - removing it rolls the switch back", () => {
    delete process.env.MOT_SOURCE;
    expect(motSource()).toBe("vdg");
  });
});

describe("fetchMotHistoryDetails", () => {
  it("asks DVSA, with the token and the API key, and never pays VDG", async () => {
    routeDvsa(json(200, VEHICLE));
    const result = await fetchMotHistoryDetails("AB12CDE");
    expect(result).toMatchObject({ status: "found", source: "dvsa", plateInRetention: false });
    const [, init] = mocks.fetch.mock.calls.find(([url]) => String(url).startsWith("https://history.mot.api.gov.uk/"))!;
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok", "X-API-Key": "api-key" });
    expect(vdgCalls()).toBe(0);
  });

  it("reuses the token for the next lookup instead of signing in again", async () => {
    routeDvsa(json(200, VEHICLE));
    await fetchMotHistoryDetails("AB12CDE");
    await fetchMotHistoryDetails("AB12CDE");
    expect(mocks.fetch.mock.calls.filter(([url]) => url === DVSA_ENV.DVSA_MOT_TOKEN_URL)).toHaveLength(1);
  });

  it("says not found for a plate DVSA doesn't know, without asking VDG", async () => {
    routeDvsa(json(404, { errorCode: "MOTH-NF-01" }));
    expect(await fetchMotHistoryDetails("ZZ99ZZZ")).toEqual({ status: "not_found" });
    expect(vdgCalls()).toBe(0);
  });

  it("falls back to VDG when DVSA errors", async () => {
    routeDvsa(json(500, {}));
    const result = await fetchMotHistoryDetails("AB12CDE");
    expect(result).toMatchObject({ status: "found", source: "vdg" });
    expect(vdgCalls()).toBe(1);
  });

  it("falls back to VDG when DVSA can't be reached at all", async () => {
    routeDvsa(new Error("network down"));
    expect(await fetchMotHistoryDetails("AB12CDE")).toMatchObject({ status: "found", source: "vdg" });
  });

  it("uses VDG alone when MOT_SOURCE isn't dvsa", async () => {
    delete process.env.MOT_SOURCE;
    routeDvsa(json(200, VEHICLE));
    expect(await fetchMotHistoryDetails("AB12CDE")).toMatchObject({ status: "found", source: "vdg" });
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes("mot.api.gov.uk"))).toBe(false);
  });

  it("is unavailable when both are down", async () => {
    mocks.fetch.mockRejectedValue(new Error("everything down"));
    expect(await fetchMotHistoryDetails("AB12CDE")).toEqual({ status: "unavailable" });
  });
});

describe("dvsaToMotHistoryDetails", () => {
  const details = dvsaToMotHistoryDetails(VEHICLE);

  it("carries the identity across under VDG's names", () => {
    expect(details).toMatchObject({ Make: "VAUXHALL", Model: "ASTRA", FuelType: "Petrol", Colour: "White" });
  });

  it("takes the MOT due date from the latest expiry - a later fail has none - in VDG's date form", () => {
    expect(details.MotDueDate).toBe("2026-09-12T00:00:00Z");
    expect(details.MotTestDetailsList![0].ExpiryDate).toBe("2026-09-12T00:00:00Z");
  });

  it("uses DVSA's first-MOT due date for a vehicle with no test yet", () => {
    expect(dvsaToMotHistoryDetails({ make: "KIA", motTestDueDate: "2027-03-01" }).MotDueDate).toBe("2027-03-01T00:00:00Z");
    expect(dvsaToMotHistoryDetails({ make: "KIA" }).MotDueDate).toBeNull();
  });

  it("maps each test and defect, keeping the type and the dangerous flag", () => {
    const failed = details.MotTestDetailsList![1];
    expect(failed).toMatchObject({ TestDate: "2024-09-12T07:59:27.000Z", TestPassed: false, ExpiryDate: null, OdometerReading: "106691" });
    // An unreadable odometer with no figure reads as "", as VDG sends it.
    expect(dvsaToMotHistoryDetails({ motTests: [{ odometerValue: null, odometerResultType: "UNREADABLE" }] }).MotTestDetailsList![0].OdometerReading).toBe("");
    expect(failed.AnnotationList).toEqual([{ Type: "DANGEROUS", Text: "Brake pipe corroded", IsDangerous: true }]);
  });

  it("parses end to end exactly as VDG data does: unreadable odometers aren't trusted", () => {
    const parsed = parseMotHistory(details.MotDueDate ?? null, details.MotTestDetailsList ?? []);
    expect(parsed.motDueDate).toBe("2026-09-12T00:00:00Z");
    expect(parsed.tests.map((t) => [t.passed, t.mileage])).toEqual([
      [true, null],
      [false, 106691],
      [true, 117153],
    ]);
    // Said once, though DVSA marks it both by type and by flag.
    expect(parsed.tests[1].notes).toContain("Failed - DANGEROUS: Brake pipe corroded");
  });
});
