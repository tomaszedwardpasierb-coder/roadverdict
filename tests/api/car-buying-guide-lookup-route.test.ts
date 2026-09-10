// Place at: tests/api/car-buying-guide-lookup-route.test.ts
// Mirrors buying-guide-lookup-route.test.ts's own coverage - same VDG
// call shape, just gated on 'four-wheeled' instead of 'motorcycle' and
// calling generateCarBuyingGuideBriefing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  parseMotHistory: vi.fn(),
  classifyVehicleType: vi.fn(),
  generateCarBuyingGuideBriefing: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/motHistory", () => ({ parseMotHistory: mocks.parseMotHistory }));
vi.mock("@/lib/tracker/vehicleTypeCheck", () => ({
  classifyVehicleType: mocks.classifyVehicleType,
}));
vi.mock("@/lib/tracker/carBuyingGuideBriefing", () => ({
  generateCarBuyingGuideBriefing: mocks.generateCarBuyingGuideBriefing,
}));
vi.stubGlobal("fetch", mocks.fetch);

import { GET } from "@/app/api/cars/buying-guide-lookup/route";

function request(vrm?: string): NextRequest {
  const url = vrm
    ? `http://localhost/api/cars/buying-guide-lookup?vrm=${encodeURIComponent(vrm)}`
    : "http://localhost/api/cars/buying-guide-lookup";
  return new NextRequest(url, { method: "GET" });
}

function vdgVehicleSuccess(overrides: { statusCode?: number; bodyType?: string; make?: string; fuelType?: string } = {}) {
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
              Vrm: "AB20FOC",
              DvlaMake: overrides.make ?? "FORD",
              DvlaModel: "FOCUS",
              YearOfManufacture: 2020,
              DvlaFuelType: overrides.fuelType ?? "PETROL",
              DvlaBodyType: overrides.bodyType ?? "HATCHBACK",
            },
            VehicleHistory: { ColourDetails: { CurrentColour: "BLUE" } },
          },
          ModelDetails: {
            ModelIdentification: { Make: "Ford", Model: "Focus" },
            Powertrain: { IceDetails: { EngineCapacityCc: 1000 } },
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
  mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
  mocks.classifyVehicleType.mockReturnValue("four-wheeled");
  mocks.parseMotHistory.mockReturnValue(parsedMotResult);
  mocks.generateCarBuyingGuideBriefing.mockResolvedValue(null);
  process.env.VDG_API_KEY = "test-key";
  delete process.env.GEMINI_API_KEY;
  // Default: both VDG calls succeed (vehicle first, MOT second)
  let callCount = 0;
  mocks.fetch.mockImplementation(() => {
    callCount++;
    return Promise.resolve(callCount === 1 ? vdgVehicleSuccess() : vdgMotSuccess());
  });
});

describe("GET /api/cars/buying-guide-lookup", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request("AB20FOC"));
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
    const response = await GET(request("AB20FOC"));
    expect(response.status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 502 when the VDG fetch throws entirely", async () => {
    mocks.fetch.mockRejectedValue(new Error("network timeout"));
    const response = await GET(request("AB20FOC"));
    expect(response.status).toBe(502);
  });

  it("returns 404 when VDG finds no vehicle for the registration", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(vdgVehicleNotFound())
      .mockResolvedValueOnce(vdgMotSuccess());
    const response = await GET(request("AB20FOC"));
    expect(response.status).toBe(404);
  });

  it("returns a well-formed result on a successful lookup", async () => {
    const response = await GET(request("AB20FOC"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      vrm: "AB20FOC",
      make: "Ford",
      model: "Focus",
      year: 2020,
      fuelType: "PETROL",
      vehicleType: "four-wheeled",
      plateInRetention: false,
    });
  });

  it("sets plateInRetention true when VDG returns StatusCode 21", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(vdgVehicleSuccess({ statusCode: 21 }))
      .mockResolvedValueOnce(vdgMotSuccess());
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.plateInRetention).toBe(true);
  });

  it("includes MOT tests (newest first) when MOT history is available", async () => {
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.motTests).toHaveLength(1);
    expect(body.motTests[0].testDate).toBe("2025-01-01");
    expect(body.motDueDate).toBe("2026-05-01");
  });

  it("returns empty motTests and null motDueDate when MOT lookup fails", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(vdgVehicleSuccess())
      .mockResolvedValueOnce(vdgMotFailure());
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.motTests).toEqual([]);
    expect(body.motDueDate).toBeNull();
    expect(response.status).toBe(200);
  });

  it("still returns 200 when the MOT fetch JSON parse fails", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(vdgVehicleSuccess())
      .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new Error("bad json")) });
    const response = await GET(request("AB20FOC"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.motTests).toEqual([]);
  });

  it("does not call generateCarBuyingGuideBriefing when GEMINI_API_KEY is absent", async () => {
    await GET(request("AB20FOC"));
    expect(mocks.generateCarBuyingGuideBriefing).not.toHaveBeenCalled();
  });

  it("does not call generateCarBuyingGuideBriefing for a non-car vehicle", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.classifyVehicleType.mockReturnValue("motorcycle");
    mocks.fetch
      .mockResolvedValueOnce(vdgVehicleSuccess({ bodyType: "MOTOR CYCLE" }))
      .mockResolvedValueOnce(vdgMotSuccess());
    await GET(request("AB20FOC"));
    expect(mocks.generateCarBuyingGuideBriefing).not.toHaveBeenCalled();
  });

  it("calls generateCarBuyingGuideBriefing for a car when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateCarBuyingGuideBriefing.mockResolvedValue({ summary: "Looks good." });
    await GET(request("AB20FOC"));
    expect(mocks.generateCarBuyingGuideBriefing).toHaveBeenCalledOnce();
  });

  it("passes the DVLA fuel type through to generateCarBuyingGuideBriefing", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(vdgVehicleSuccess({ fuelType: "HYBRID ELECTRIC (CLEAN)" }))
      .mockResolvedValueOnce(vdgMotSuccess());
    await GET(request("AB20FOC"));
    const callArg = mocks.generateCarBuyingGuideBriefing.mock.calls[0][0];
    expect(callArg.fuelType).toBe("HYBRID ELECTRIC (CLEAN)");
  });

  it("includes the briefing in the response when Gemini returns one", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    const briefing = { summary: "Good history, no red flags." };
    mocks.generateCarBuyingGuideBriefing.mockResolvedValue(briefing);
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.briefing).toEqual(briefing);
  });

  it("sets briefing to null when Gemini key is absent", async () => {
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.briefing).toBeNull();
  });

  it("normalises the VRM to uppercase with spaces stripped before sending to VDG", async () => {
    await GET(request("ab20 foc"));
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("AB20FOC"));
  });

  it("makes exactly two parallel VDG calls (vehicle + MOT)", async () => {
    await GET(request("AB20FOC"));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    const urls = mocks.fetch.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.some((u: string) => u.includes("VehicleDetails"))).toBe(true);
    expect(urls.some((u: string) => u.includes("MotHistoryDetails"))).toBe(true);
  });
});
