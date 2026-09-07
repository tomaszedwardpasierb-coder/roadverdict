import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentPetrolPricePenceLitre: vi.fn(),
  getCurrentDieselPricePenceLitre: vi.fn(),
}));

vi.mock("@/lib/fuelPrice", () => ({
  getCurrentPetrolPricePenceLitre: mocks.getCurrentPetrolPricePenceLitre,
  getCurrentDieselPricePenceLitre: mocks.getCurrentDieselPricePenceLitre,
}));

import { POST } from "@/app/api/cars/cost-calculator/route";

function request(body: unknown, ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/cars/cost-calculator", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function badJsonRequest(ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/cars/cost-calculator", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: "not-json",
  });
}

const validBody = {
  carClass: "medium",
  brand: "ford",
  region: "london-se",
  fuelType: "petrol",
  annualMileage: 7000,
  co2Gkm: 120,
};

beforeEach(() => {
  mocks.getCurrentPetrolPricePenceLitre.mockReset();
  mocks.getCurrentPetrolPricePenceLitre.mockResolvedValue(150);
  mocks.getCurrentDieselPricePenceLitre.mockReset();
  mocks.getCurrentDieselPricePenceLitre.mockResolvedValue(157);
});

describe("POST /api/cars/cost-calculator", () => {
  it("rejects malformed JSON", async () => {
    const response = await POST(badJsonRequest("203.113.20.1"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
  });

  it("rejects an invalid carClass", async () => {
    const response = await POST(request({ ...validBody, carClass: "huge" }, "203.113.20.2"));
    expect(response.status).toBe(400);
  });

  it("rejects an electric fuelType (not supported by this calculator yet)", async () => {
    const response = await POST(request({ ...validBody, fuelType: "electric" }, "203.113.20.3"));
    expect(response.status).toBe(400);
  });

  it("rejects an out-of-range annual mileage", async () => {
    const response = await POST(request({ ...validBody, annualMileage: 100000 }, "203.113.20.4"));
    expect(response.status).toBe(400);
  });

  it("rejects a zero or negative annual mileage", async () => {
    const response = await POST(request({ ...validBody, annualMileage: 0 }, "203.113.20.5"));
    expect(response.status).toBe(400);
  });

  it("rejects an invalid region", async () => {
    const response = await POST(request({ ...validBody, region: "mars" }, "203.113.20.6"));
    expect(response.status).toBe(400);
  });

  it("rejects a negative co2Gkm", async () => {
    const response = await POST(request({ ...validBody, co2Gkm: -10 }, "203.113.20.7"));
    expect(response.status).toBe(400);
  });

  it("accepts a request with co2Gkm omitted entirely", async () => {
    const { co2Gkm: _unused, ...withoutCo2 } = validBody;
    const response = await POST(request(withoutCo2, "203.113.20.8"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.breakdown.vedUnknown).toBe(true);
  });

  it("returns a full annual cost breakdown for a valid petrol request", async () => {
    const response = await POST(request(validBody, "203.113.20.9"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.breakdown).toMatchObject({
      servicing: expect.any(Number),
      tyres: expect.any(Number),
      mot: expect.any(Number),
      tax: expect.any(Number),
      fuel: expect.any(Number),
      total: expect.any(Number),
      vedUnknown: false,
    });
    expect(body.brandLabel).toBe("Ford");
    expect(body.regionLabel).toBe("London & South East");
    expect(mocks.getCurrentPetrolPricePenceLitre).toHaveBeenCalled();
    expect(mocks.getCurrentDieselPricePenceLitre).not.toHaveBeenCalled();
  });

  it("reads the diesel price for a diesel request, not the petrol one", async () => {
    const response = await POST(request({ ...validBody, fuelType: "diesel" }, "203.113.20.10"));
    expect(response.status).toBe(200);
    expect(mocks.getCurrentDieselPricePenceLitre).toHaveBeenCalled();
    expect(mocks.getCurrentPetrolPricePenceLitre).not.toHaveBeenCalled();
  });

  it("propagates a rejection from the fuel price lookup rather than hanging (no try/catch around computeCarAnnualCost in this route)", async () => {
    mocks.getCurrentPetrolPricePenceLitre.mockRejectedValue(new Error("Cosmos unreachable"));
    await expect(POST(request(validBody, "203.113.20.11"))).rejects.toThrow("Cosmos unreachable");
  });

  it("rate-limits after too many requests from the same IP within the window", async () => {
    const ip = "198.51.100.62";
    for (let i = 0; i < 20; i++) {
      const response = await POST(request(validBody, ip));
      expect(response.status).toBe(200);
    }

    const limited = await POST(request(validBody, ip));
    expect(limited.status).toBe(429);
  });
});
