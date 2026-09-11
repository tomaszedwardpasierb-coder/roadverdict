import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  parseMotHistory: vi.fn(),
  fetchVehicleTaxDetailsFromVdg: vi.fn(),
  fetch: vi.fn(),
  getUserDoc: vi.fn(),
  canRunVehicleLookup: vi.fn(),
  recordVehicleLookupRun: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/motHistory", () => ({ parseMotHistory: mocks.parseMotHistory }));
vi.mock("@/lib/tracker/vehicleTaxFetch", () => ({ fetchVehicleTaxDetailsFromVdg: mocks.fetchVehicleTaxDetailsFromVdg }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/tracker/vehicleLookupCooldown", () => ({
  canRunVehicleLookup: mocks.canRunVehicleLookup,
  recordVehicleLookupRun: mocks.recordVehicleLookupRun,
}));
vi.stubGlobal("fetch", mocks.fetch);

import { GET } from "@/app/api/tracker/cost-calculator-lookup/route";

function request(vrm?: string): NextRequest {
  const url = vrm
    ? `http://localhost/api/tracker/cost-calculator-lookup?vrm=${encodeURIComponent(vrm)}`
    : "http://localhost/api/tracker/cost-calculator-lookup";
  return new NextRequest(url, { method: "GET" });
}

function vdgMotSuccess(overrides: { statusCode?: number; make?: string } = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: { StatusCode: overrides.statusCode ?? 0, IsSuccessStatusCode: true },
        Results: {
          MotHistoryDetails: {
            Make: overrides.make ?? "BMW",
            Model: "640",
            FuelType: "Petrol",
            Colour: "Silver",
            MotDueDate: "2026-10-18",
            MotTestDetailsList: [],
          },
        },
      }),
  };
}

function vdgMotNotFound() {
  return {
    ok: true,
    json: () => Promise.resolve({ ResponseInformation: { StatusCode: 0, IsSuccessStatusCode: false }, Results: {} }),
  };
}

const parsedMotResult = {
  motDueDate: "2026-10-18",
  tests: [{ testDate: "2025-10-17", passed: true, mileage: 43851, mileageTrusted: true, notes: "Passed" }],
};

const taxDetails = {
  make: "BMW",
  taxStatus: "Taxed",
  taxIsCurrentlyValid: true,
  taxDueDate: "2027-06-01",
  taxDaysRemaining: 263,
  motStatus: "Valid",
  vedStandardTwelveMonths: 27,
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  mocks.parseMotHistory.mockReturnValue(parsedMotResult);
  mocks.fetch.mockResolvedValue(vdgMotSuccess());
  mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue(taxDetails);
  mocks.getUserDoc.mockResolvedValue(null);
  mocks.canRunVehicleLookup.mockReturnValue(true);
  process.env.VDG_API_KEY = "test-key";
});

describe("GET /api/tracker/cost-calculator-lookup", () => {
  it("returns 429 and never calls VDG when the account is on cooldown", async () => {
    mocks.canRunVehicleLookup.mockReturnValue(false);
    const response = await GET(request("AB12CDE"));
    expect(response.status).toBe(429);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("records the lookup run after a successful VDG call", async () => {
    await GET(request("AB12CDE"));
    expect(mocks.recordVehicleLookupRun).toHaveBeenCalledWith("rider@example.com");
  });


  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request("PA63ERB"));
    expect(response.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when no vrm query param is provided", async () => {
    const response = await GET(request());
    expect(response.status).toBe(400);
  });

  it("returns 503 when VDG_API_KEY is not configured", async () => {
    delete process.env.VDG_API_KEY;
    const response = await GET(request("PA63ERB"));
    expect(response.status).toBe(503);
  });

  it("returns 502 when the MOT fetch throws", async () => {
    mocks.fetch.mockRejectedValue(new Error("network timeout"));
    const response = await GET(request("PA63ERB"));
    expect(response.status).toBe(502);
  });

  it("returns 404 when VDG finds no vehicle for the registration", async () => {
    mocks.fetch.mockResolvedValue(vdgMotNotFound());
    const response = await GET(request("PA63ERB"));
    expect(response.status).toBe(404);
  });

  it("returns identity + MOT + real tax details together", async () => {
    const response = await GET(request("PA63ERB"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ vrm: "PA63ERB", make: "BMW", model: "640", fuelType: "Petrol" });
    expect(body.taxDetails).toEqual(taxDetails);
  });

  it("runs the MOT and tax fetches in parallel (both called once each)", async () => {
    await GET(request("PA63ERB"));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetchVehicleTaxDetailsFromVdg).toHaveBeenCalledWith("PA63ERB", "test-key");
  });

  it("still succeeds with taxDetails null when the tax lookup itself fails", async () => {
    mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue(null);
    const response = await GET(request("PA63ERB"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.taxDetails).toBeNull();
  });

  it("sets plateInRetention true when VDG returns StatusCode 21", async () => {
    mocks.fetch.mockResolvedValue(vdgMotSuccess({ statusCode: 21 }));
    const response = await GET(request("PA63ERB"));
    const body = await response.json();
    expect(body.plateInRetention).toBe(true);
  });

  it("normalises the VRM to uppercase with spaces stripped before sending to VDG", async () => {
    await GET(request("pa63 erb"));
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("PA63ERB"));
  });
});
