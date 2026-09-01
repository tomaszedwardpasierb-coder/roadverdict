import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentPetrolPricePenceLitre: vi.fn(),
  generateCostAdvice: vi.fn(),
}));

vi.mock("@/lib/fuelPrice", () => ({ getCurrentPetrolPricePenceLitre: mocks.getCurrentPetrolPricePenceLitre }));
vi.mock("@/lib/tracker/costAdvice", () => ({ generateCostAdvice: mocks.generateCostAdvice }));

import { POST } from "@/app/api/cost-calculator/route";

function request(body: unknown, ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/cost-calculator", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function badJsonRequest(ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/cost-calculator", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: "not-json",
  });
}

const validBody = { bikeClass: "medium", brand: "honda", region: "london-se", annualMileage: 4000 };

beforeEach(() => {
  mocks.getCurrentPetrolPricePenceLitre.mockReset();
  mocks.generateCostAdvice.mockReset();
  mocks.getCurrentPetrolPricePenceLitre.mockResolvedValue(150);
  mocks.generateCostAdvice.mockResolvedValue(null);
  delete process.env.GEMINI_API_KEY;
});

describe("POST /api/cost-calculator", () => {
  it("rejects malformed JSON", async () => {
    const response = await POST(badJsonRequest("203.0.113.20"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
  });

  it("rejects an invalid bikeClass", async () => {
    const response = await POST(request({ ...validBody, bikeClass: "huge" }, "203.0.113.21"));
    expect(response.status).toBe(400);
  });

  it("rejects an out-of-range annual mileage", async () => {
    const response = await POST(request({ ...validBody, annualMileage: 100000 }, "203.0.113.22"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please check your answers and try again." });
  });

  it("rejects a zero or negative annual mileage", async () => {
    const response = await POST(request({ ...validBody, annualMileage: 0 }, "203.0.113.23"));
    expect(response.status).toBe(400);
  });

  it("rejects an invalid region", async () => {
    const response = await POST(request({ ...validBody, region: "mars" }, "203.0.113.24"));
    expect(response.status).toBe(400);
  });

  it("returns a full annual cost breakdown for a valid request", async () => {
    const response = await POST(request(validBody, "203.0.113.25"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.breakdown).toMatchObject({
      servicing: expect.any(Number),
      tyres: expect.any(Number),
      mot: expect.any(Number),
      tax: expect.any(Number),
      fuel: expect.any(Number),
      total: expect.any(Number),
    });
    expect(body.brandLabel).toBe("Honda");
    expect(body.regionLabel).toBe("London & South East");
  });

  it("does not call generateCostAdvice when GEMINI_API_KEY is absent, and advice is null", async () => {
    const response = await POST(request(validBody, "203.0.113.26"));
    const body = await response.json();
    expect(mocks.generateCostAdvice).not.toHaveBeenCalled();
    expect(body.advice).toBeNull();
  });

  it("calls generateCostAdvice and includes its result when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateCostAdvice.mockResolvedValue({ summary: "Reasonable running costs for this bike." });

    const response = await POST(request(validBody, "203.0.113.27"));
    const body = await response.json();

    expect(mocks.generateCostAdvice).toHaveBeenCalledOnce();
    expect(body.advice).toEqual({ summary: "Reasonable running costs for this bike." });
  });

  it("still returns a full breakdown even if generateCostAdvice returns null despite the key being set", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateCostAdvice.mockResolvedValue(null);

    const response = await POST(request(validBody, "203.0.113.28"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.advice).toBeNull();
    expect(body.breakdown.total).toBeGreaterThan(0);
  });

  it("propagates a rejection from the petrol price lookup rather than hanging (no try/catch around computeAnnualCost in this route)", async () => {
    // The real fuelPrice.ts always resolves (it catches its own Cosmos
    // errors internally and falls back to a hardcoded constant) - this
    // route trusts that and has no try/catch of its own around
    // computeAnnualCost. Mocking a rejection here proves that trust: if
    // the dependency ever stopped catching its own errors, this route
    // would surface an unhandled rejection rather than a clean response.
    mocks.getCurrentPetrolPricePenceLitre.mockRejectedValue(new Error("Cosmos unreachable"));

    await expect(POST(request(validBody, "203.0.113.29"))).rejects.toThrow("Cosmos unreachable");
  });

  it("rate-limits after too many requests from the same IP within the window", async () => {
    const ip = "198.51.100.50";
    for (let i = 0; i < 20; i++) {
      const response = await POST(request(validBody, ip));
      expect(response.status).toBe(200);
    }

    const limited = await POST(request(validBody, ip));
    expect(limited.status).toBe(429);
  });
});
