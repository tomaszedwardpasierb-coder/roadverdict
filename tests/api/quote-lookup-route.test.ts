import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  parseMotHistory: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/motHistory", () => ({ parseMotHistory: mocks.parseMotHistory }));
vi.stubGlobal("fetch", mocks.fetch);

import { GET } from "@/app/api/tracker/quote-lookup/route";

function request(vrm?: string): NextRequest {
  const url = vrm ? `http://localhost/api/tracker/quote-lookup?vrm=${encodeURIComponent(vrm)}` : "http://localhost/api/tracker/quote-lookup";
  return new NextRequest(url, { method: "GET" });
}

function vdgSuccess(overrides: { statusCode?: number; make?: string } = {}) {
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

function vdgNotFound() {
  return {
    ok: true,
    json: () => Promise.resolve({ ResponseInformation: { StatusCode: 0, IsSuccessStatusCode: false }, Results: {} }),
  };
}

const parsedMotResult = {
  motDueDate: "2026-10-18",
  tests: [{ testDate: "2025-10-17", passed: true, mileage: 43851, mileageTrusted: true, notes: "Passed" }],
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  mocks.parseMotHistory.mockReturnValue(parsedMotResult);
  mocks.fetch.mockResolvedValue(vdgSuccess());
  process.env.VDG_API_KEY = "test-key";
});

describe("GET /api/tracker/quote-lookup", () => {
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

  it("returns 502 when the VDG fetch throws", async () => {
    mocks.fetch.mockRejectedValue(new Error("network timeout"));
    const response = await GET(request("PA63ERB"));
    expect(response.status).toBe(502);
  });

  it("returns 404 when VDG finds no vehicle for the registration", async () => {
    mocks.fetch.mockResolvedValue(vdgNotFound());
    const response = await GET(request("PA63ERB"));
    expect(response.status).toBe(404);
  });

  it("returns identity straight from MotHistoryDetails' own top-level fields, with no VehicleDetails call at all", async () => {
    const response = await GET(request("PA63ERB"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ vrm: "PA63ERB", make: "BMW", model: "640", fuelType: "Petrol", colour: "Silver" });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const url = mocks.fetch.mock.calls[0][0] as string;
    expect(url).toContain("packageName=MotHistoryDetails");
    expect(url).not.toContain("packageName=VehicleDetails");
  });

  it("sets plateInRetention true when VDG returns StatusCode 21", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess({ statusCode: 21 }));
    const response = await GET(request("PA63ERB"));
    const body = await response.json();
    expect(body.plateInRetention).toBe(true);
  });

  it("returns MOT tests newest-first", async () => {
    mocks.parseMotHistory.mockReturnValue({
      motDueDate: "2026-10-18",
      tests: [
        { testDate: "2023-10-14", passed: true, mileage: 37763, mileageTrusted: true, notes: "Passed" },
        { testDate: "2025-10-17", passed: true, mileage: 43851, mileageTrusted: true, notes: "Passed" },
      ],
    });
    const response = await GET(request("PA63ERB"));
    const body = await response.json();
    expect(body.motTests[0].testDate).toBe("2025-10-17");
    expect(body.motTests[1].testDate).toBe("2023-10-14");
  });

  it("normalises the VRM to uppercase with spaces stripped before sending to VDG", async () => {
    await GET(request("pa63 erb"));
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("PA63ERB"));
  });
});
