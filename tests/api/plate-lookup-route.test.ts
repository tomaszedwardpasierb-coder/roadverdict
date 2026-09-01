import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  classifyVehicleType: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/vehicleTypeCheck", () => ({
  classifyVehicleType: mocks.classifyVehicleType,
}));
vi.stubGlobal("fetch", mocks.fetch);

import { GET } from "@/app/api/tracker/plate-lookup/route";

function request(vrm?: string): NextRequest {
  const url = vrm
    ? `http://localhost/api/tracker/plate-lookup?vrm=${encodeURIComponent(vrm)}`
    : "http://localhost/api/tracker/plate-lookup";
  return new NextRequest(url, { method: "GET" });
}

// Minimal valid VDG response shape
function vdgSuccess(overrides: Partial<{
  statusCode: number;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  bodyType: string;
  colour: string;
  modelMake: string;
  modelModel: string;
  engineCc: number;
}> = {}) {
  const o = {
    statusCode: 0,
    make: "YAMAHA",
    model: "MT-07",
    year: 2020,
    fuelType: "PETROL",
    bodyType: "MOTOR CYCLE",
    colour: "BLUE",
    modelMake: "Yamaha",
    modelModel: "MT-07",
    engineCc: 689,
    ...overrides,
  };
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: {
          StatusCode: o.statusCode,
          StatusMessage: "OK",
          IsSuccessStatusCode: true,
        },
        Results: {
          VehicleDetails: {
            VehicleIdentification: {
              Vrm: "AB20YAM",
              DvlaMake: o.make,
              DvlaModel: o.model,
              YearOfManufacture: o.year,
              DvlaFuelType: o.fuelType,
              DvlaBodyType: o.bodyType,
            },
            VehicleHistory: {
              ColourDetails: { CurrentColour: o.colour },
            },
          },
          ModelDetails: {
            ModelIdentification: {
              Make: o.modelMake,
              Model: o.modelModel,
              Range: "",
            },
            Powertrain: {
              IceDetails: { EngineCapacityCc: o.engineCc },
            },
          },
        },
      }),
  };
}

function vdgNotFound() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: { StatusCode: 0, StatusMessage: "Not found", IsSuccessStatusCode: false },
        Results: {},
      }),
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  mocks.classifyVehicleType.mockReturnValue("motorcycle");
  process.env.VDG_API_KEY = "test-key";
});

describe("GET /api/tracker/plate-lookup", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request("AB12CDE"));
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
    const response = await GET(request("AB12CDE"));
    expect(response.status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 502 when the VDG fetch throws", async () => {
    mocks.fetch.mockRejectedValue(new Error("network timeout"));
    const response = await GET(request("AB12CDE"));
    expect(response.status).toBe(502);
  });

  it("returns 404 when VDG reports no vehicle for that registration", async () => {
    mocks.fetch.mockResolvedValue(vdgNotFound());
    const response = await GET(request("AB12CDE"));
    expect(response.status).toBe(404);
  });

  it("returns a well-formed result for a successful lookup", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      vrm: "AB20YAM",
      make: "Yamaha",       // ModelDetails.Make preferred over DvlaMake
      model: "MT-07",
      year: 2020,
      fuelType: "PETROL",
      colour: "BLUE",
      engineCapacityCc: 689,
      plateInRetention: false,
      vehicleType: "motorcycle",
    });
  });

  it("prefers ModelDetails make/model over DvlaMake/DvlaModel when both are present", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess({ make: "YAMAHA", modelMake: "Yamaha" }));
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.make).toBe("Yamaha"); // ModelDetails, not DVLA all-caps
  });

  it("falls back to DvlaMake/DvlaModel when ModelDetails is absent", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ResponseInformation: { StatusCode: 0, StatusMessage: "OK", IsSuccessStatusCode: true },
          Results: {
            VehicleDetails: {
              VehicleIdentification: {
                Vrm: "AB20YAM",
                DvlaMake: "YAMAHA",
                DvlaModel: "MT07",
                YearOfManufacture: 2020,
                DvlaFuelType: "PETROL",
                DvlaBodyType: "MOTOR CYCLE",
              },
              VehicleHistory: { ColourDetails: { CurrentColour: "BLUE" } },
            },
            // ModelDetails deliberately absent
          },
        }),
    });
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.make).toBe("YAMAHA");
    expect(body.model).toBe("MT07");
    expect(body.engineCapacityCc).toBeNull();
  });

  it("sets plateInRetention to true when VDG returns StatusCode 21", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess({ statusCode: 21 }));
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.plateInRetention).toBe(true);
  });

  it("sets plateInRetention to false for any other status code", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess({ statusCode: 0 }));
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.plateInRetention).toBe(false);
  });

  it("passes the DvlaBodyType to classifyVehicleType and includes the result", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess({ bodyType: "SALOON" }));
    mocks.classifyVehicleType.mockReturnValue("four-wheeled");
    const response = await GET(request("AB20YAM"));
    expect(mocks.classifyVehicleType).toHaveBeenCalledWith("SALOON");
    const body = await response.json();
    expect(body.vehicleType).toBe("four-wheeled");
  });

  it("normalises the VRM to uppercase with spaces stripped before sending to VDG", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    await GET(request("ab20 yam"));
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("AB20YAM"));
  });

  it("returns an empty string for colour when VehicleHistory colour is absent", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ResponseInformation: { StatusCode: 0, StatusMessage: "OK", IsSuccessStatusCode: true },
          Results: {
            VehicleDetails: {
              VehicleIdentification: {
                Vrm: "AB20YAM",
                DvlaMake: "YAMAHA",
                DvlaModel: "MT07",
                YearOfManufacture: 2020,
                DvlaFuelType: "PETROL",
                DvlaBodyType: "MOTOR CYCLE",
              },
              // No VehicleHistory
            },
          },
        }),
    });
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.colour).toBe("");
  });
});
