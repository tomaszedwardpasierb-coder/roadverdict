import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  parseMotHistory: vi.fn(),
  classifyVehicleType: vi.fn(),
  generateBuyingGuideBriefing: vi.fn(),
  isPro: vi.fn(),
  getUserDoc: vi.fn(),
  canRunFreeVdiCheck: vi.fn(),
  recordVdiCheckRun: vi.fn(),
  nextFreeVdiCheckAt: vi.fn(),
  fetchVdiCheckFromVdg: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/motHistory", () => ({ parseMotHistory: mocks.parseMotHistory }));
vi.mock("@/lib/tracker/vehicleTypeCheck", () => ({
  classifyVehicleType: mocks.classifyVehicleType,
}));
vi.mock("@/lib/tracker/buyingGuideBriefing", () => ({
  generateBuyingGuideBriefing: mocks.generateBuyingGuideBriefing,
}));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/tracker/vdiCheckUsage", () => ({
  canRunFreeVdiCheck: mocks.canRunFreeVdiCheck,
  recordVdiCheckRun: mocks.recordVdiCheckRun,
  nextFreeVdiCheckAt: mocks.nextFreeVdiCheckAt,
}));
vi.mock("@/lib/tracker/vdiCheckFetch", () => ({ fetchVdiCheckFromVdg: mocks.fetchVdiCheckFromVdg }));
vi.stubGlobal("fetch", mocks.fetch);

import { GET } from "@/app/api/tracker/buying-guide-lookup/route";

function request(vrm?: string, includeVdi?: boolean): NextRequest {
  const params = new URLSearchParams();
  if (vrm) params.set("vrm", vrm);
  if (includeVdi) params.set("includeVdi", "1");
  const qs = params.toString();
  const url = `http://localhost/api/tracker/buying-guide-lookup${qs ? `?${qs}` : ""}`;
  return new NextRequest(url, { method: "GET" });
}

function vdgVehicleSuccess(overrides: { statusCode?: number; bodyType?: string; make?: string } = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: {
          StatusCode: overrides.statusCode ?? 0,
          IsSuccessStatusCode: true,
        },
        Results: {
          VehicleDetails: {
            VehicleIdentification: {
              Vrm: "AB20YAM",
              DvlaMake: overrides.make ?? "YAMAHA",
              DvlaModel: "MT-07",
              YearOfManufacture: 2020,
              DvlaFuelType: "PETROL",
              DvlaBodyType: overrides.bodyType ?? "MOTOR CYCLE",
            },
            VehicleHistory: { ColourDetails: { CurrentColour: "BLUE" } },
          },
          ModelDetails: {
            ModelIdentification: { Make: "Yamaha", Model: "MT-07" },
            Powertrain: { IceDetails: { EngineCapacityCc: 689 } },
          },
        },
      }),
  };
}

function vdgVehicleNotFound() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: { StatusCode: 0, IsSuccessStatusCode: false },
        Results: {},
      }),
  };
}

function vdgMotSuccess(tests: object[] = []) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: { IsSuccessStatusCode: true },
        Results: {
          MotHistoryDetails: {
            MotDueDate: "2026-05-01",
            MotTestDetailsList: tests,
          },
        },
      }),
  };
}

function vdgMotFailure() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: { IsSuccessStatusCode: false },
        Results: {},
      }),
  };
}

const parsedMotResult = {
  motDueDate: "2026-05-01",
  tests: [
    { testDate: "2025-01-01", passed: true, mileage: 12000, mileageTrusted: true, notes: "" },
  ],
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  mocks.classifyVehicleType.mockReturnValue("motorcycle");
  mocks.parseMotHistory.mockReturnValue(parsedMotResult);
  mocks.generateBuyingGuideBriefing.mockResolvedValue(null);
  mocks.isPro.mockResolvedValue(false);
  mocks.getUserDoc.mockResolvedValue(null);
  mocks.canRunFreeVdiCheck.mockReturnValue(true);
  mocks.nextFreeVdiCheckAt.mockReturnValue(null);
  mocks.fetchVdiCheckFromVdg.mockResolvedValue({
    isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
    keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
    vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: null,
  });
  process.env.VDG_API_KEY = "test-key";
  delete process.env.GEMINI_API_KEY;
  // Default: both VDG calls succeed (vehicle first, MOT second)
  let callCount = 0;
  mocks.fetch.mockImplementation(() => {
    callCount++;
    return Promise.resolve(callCount === 1 ? vdgVehicleSuccess() : vdgMotSuccess());
  });
});

describe("GET /api/tracker/buying-guide-lookup", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when no vrm query param is provided", async () => {
    const response = await GET(request());
    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 503 when VDG_API_KEY is not configured", async () => {
    delete process.env.VDG_API_KEY;
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 502 when the VDG fetch throws entirely", async () => {
    // Promise.all wraps both fetches — ALL must reject for the outer catch to fire
    mocks.fetch.mockRejectedValue(new Error("network timeout"));
    mocks.fetch.mockRejectedValue(new Error("network timeout"));
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(502);
  });

  it("returns 404 when VDG finds no vehicle for the registration", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(vdgVehicleNotFound())
      .mockResolvedValueOnce(vdgMotSuccess());
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(404);
  });

  it("returns a well-formed result on a successful lookup", async () => {
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      vrm: "AB20YAM",
      make: "Yamaha",
      model: "MT-07",
      year: 2020,
      fuelType: "PETROL",
      vehicleType: "motorcycle",
      plateInRetention: false,
    });
  });

  it("sets plateInRetention true when VDG returns StatusCode 21", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(vdgVehicleSuccess({ statusCode: 21 }))
      .mockResolvedValueOnce(vdgMotSuccess());
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.plateInRetention).toBe(true);
  });

  it("includes MOT tests (newest first) when MOT history is available", async () => {
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    // parsedMotResult has one test; reversed = still one test at index 0
    expect(body.motTests).toHaveLength(1);
    expect(body.motTests[0].testDate).toBe("2025-01-01");
    expect(body.motDueDate).toBe("2026-05-01");
  });

  it("returns empty motTests and null motDueDate when MOT lookup fails", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(vdgVehicleSuccess())
      .mockResolvedValueOnce(vdgMotFailure());
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.motTests).toEqual([]);
    expect(body.motDueDate).toBeNull();
    // Vehicle lookup itself still succeeded
    expect(response.status).toBe(200);
  });

  // MOT fetch failing (network error on that specific call) is caught via
  // .catch(() => null) in the route, so the overall lookup still succeeds.
  it("still returns 200 when the MOT fetch JSON parse fails", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(vdgVehicleSuccess())
      .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new Error("bad json")) });
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.motTests).toEqual([]);
  });

  it("does not call generateBuyingGuideBriefing when GEMINI_API_KEY is absent", async () => {
    await GET(request("AB20YAM"));
    expect(mocks.generateBuyingGuideBriefing).not.toHaveBeenCalled();
  });

  it("does not call generateBuyingGuideBriefing for a non-motorcycle vehicle", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.classifyVehicleType.mockReturnValue("four-wheeled");
    mocks.fetch
      .mockResolvedValueOnce(vdgVehicleSuccess({ bodyType: "SALOON" }))
      .mockResolvedValueOnce(vdgMotSuccess());
    await GET(request("AB20YAM"));
    expect(mocks.generateBuyingGuideBriefing).not.toHaveBeenCalled();
  });

  it("calls generateBuyingGuideBriefing for a motorcycle when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateBuyingGuideBriefing.mockResolvedValue({ summary: "Looks good." });
    await GET(request("AB20YAM"));
    expect(mocks.generateBuyingGuideBriefing).toHaveBeenCalledOnce();
  });

  it("includes the briefing in the response when Gemini returns one", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    const briefing = { summary: "Good history, no red flags." };
    mocks.generateBuyingGuideBriefing.mockResolvedValue(briefing);
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.briefing).toEqual(briefing);
  });

  it("sets briefing to null when Gemini key is absent", async () => {
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.briefing).toBeNull();
  });

  // The route passes motTestsOldestFirst (oldest→newest) to the briefing
  // generator but reverses the same list for the response body (newest first).
  // Both directions come from the same parseMotHistory result.
  it("passes oldest-to-newest test order to generateBuyingGuideBriefing", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    const twoTests = {
      motDueDate: "2026-05-01",
      tests: [
        { testDate: "2023-01-01", passed: true, mileage: 8000, mileageTrusted: true, notes: "" },
        { testDate: "2025-01-01", passed: true, mileage: 14000, mileageTrusted: true, notes: "" },
      ],
    };
    mocks.parseMotHistory.mockReturnValue(twoTests);
    mocks.generateBuyingGuideBriefing.mockResolvedValue(null);
    await GET(request("AB20YAM"));
    const callArg = mocks.generateBuyingGuideBriefing.mock.calls[0][0];
    // oldest first: 2023 then 2025
    expect(callArg.motTests[0].testDate).toBe("2023-01-01");
    expect(callArg.motTests[1].testDate).toBe("2025-01-01");
  });

  it("returns motTests newest-first in the response body", async () => {
    const twoTests = {
      motDueDate: "2026-05-01",
      tests: [
        { testDate: "2023-01-01", passed: true, mileage: 8000, mileageTrusted: true, notes: "" },
        { testDate: "2025-01-01", passed: true, mileage: 14000, mileageTrusted: true, notes: "" },
      ],
    };
    mocks.parseMotHistory.mockReturnValue(twoTests);
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    // newest first: 2025 then 2023
    expect(body.motTests[0].testDate).toBe("2025-01-01");
    expect(body.motTests[1].testDate).toBe("2023-01-01");
  });

  it("normalises the VRM to uppercase with spaces stripped before sending to VDG", async () => {
    await GET(request("ab20 yam"));
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("AB20YAM"));
  });

  it("makes exactly two parallel VDG calls (vehicle + MOT)", async () => {
    await GET(request("AB20YAM"));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    const urls = mocks.fetch.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.some((u: string) => u.includes("VehicleDetails"))).toBe(true);
    expect(urls.some((u: string) => u.includes("MotHistoryDetails"))).toBe(true);
  });

  // ── VDI add-on ───────────────────────────────────────────────────────

  it("does not run a VDI check when includeVdi wasn't requested", async () => {
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheck).toBeNull();
  });

  it("does not run a VDI check for a non-motorcycle even when includeVdi is requested", async () => {
    mocks.classifyVehicleType.mockReturnValue("four-wheeled");
    await GET(request("AB20YAM", true));
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
  });

  it("runs the VDI check for a free account off cooldown, and records the run", async () => {
    const response = await GET(request("AB20YAM", true));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).toHaveBeenCalledWith("AB20YAM", "test-key");
    expect(mocks.recordVdiCheckRun).toHaveBeenCalledWith("rider@example.com");
    expect(body.vdiCheck).toMatchObject({ isStolen: false });
  });

  it("runs the VDI check for a Pro account without ever checking the cooldown or recording a run", async () => {
    mocks.isPro.mockResolvedValue(true);
    await GET(request("AB20YAM", true));
    expect(mocks.canRunFreeVdiCheck).not.toHaveBeenCalled();
    expect(mocks.fetchVdiCheckFromVdg).toHaveBeenCalled();
    expect(mocks.recordVdiCheckRun).not.toHaveBeenCalled();
  });

  it("blocks a free account on cooldown, returning the reason and next-available date instead of a vdiCheck", async () => {
    mocks.canRunFreeVdiCheck.mockReturnValue(false);
    mocks.nextFreeVdiCheckAt.mockReturnValue("2026-02-01T00:00:00.000Z");
    const response = await GET(request("AB20YAM", true));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheck).toBeNull();
    expect(body.vdiCheckBlockedReason).toBe("cooldown");
    expect(body.vdiCheckAvailableAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("passes the vdiCheck result through to the briefing generator when present", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    await GET(request("AB20YAM", true));
    const callArg = mocks.generateBuyingGuideBriefing.mock.calls[0][0];
    expect(callArg.vdiCheck).toMatchObject({ isStolen: false });
  });
});
