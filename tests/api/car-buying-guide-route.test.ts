import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  logCarBuyingGuideCheck: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ logCarBuyingGuideCheck: mocks.logCarBuyingGuideCheck }));

import { POST } from "@/app/api/cars/buying-guide/route";

function request(body: unknown, ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/cars/buying-guide", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function badJsonRequest(ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/cars/buying-guide", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: "not-json",
  });
}

const validBody = { carClass: "medium", brand: "ford", ageBand: "used" };

beforeEach(() => {
  mocks.logCarBuyingGuideCheck.mockReset();
});

describe("POST /api/cars/buying-guide", () => {
  it("rejects malformed JSON without logging anything", async () => {
    const response = await POST(badJsonRequest("203.113.30.1"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
    expect(mocks.logCarBuyingGuideCheck).not.toHaveBeenCalled();
  });

  it("rejects an invalid carClass", async () => {
    const response = await POST(request({ ...validBody, carClass: "huge" }, "203.113.30.2"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please check your answers and try again." });
  });

  // Unlike the quote-checker and cost-calculator routes, 'electric' IS a
  // valid carClass here - a buying-guide checklist has no benchmark-data
  // gap to work around (see the ADR's Phase 7 scope cut, which is
  // pricing-only).
  it("accepts an electric carClass", async () => {
    const response = await POST(request({ ...validBody, carClass: "electric" }, "203.113.30.3"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.carClassLabel).toBe("Electric");
  });

  it("rejects an invalid brand", async () => {
    const response = await POST(request({ ...validBody, brand: "not-a-real-brand" }, "203.113.30.4"));
    expect(response.status).toBe(400);
  });

  it("rejects an invalid ageBand", async () => {
    const response = await POST(request({ ...validBody, ageBand: "vintage" }, "203.113.30.5"));
    expect(response.status).toBe(400);
  });

  it("rejects a request missing required fields", async () => {
    const response = await POST(request({ carClass: "medium" }, "203.113.30.6"));
    expect(response.status).toBe(400);
  });

  it("returns a well-formed checklist for a valid request", async () => {
    const response = await POST(request(validBody, "203.113.30.7"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ageBandLabel).toBe("Used (2000–2014)");
    expect(body.carClassLabel).toBe("Medium (1.3-2.0L)");
    expect(body.brandLabel).toBe("Ford");
    expect(body.checklist).toBeDefined();
    expect(body.addendum).toBeDefined();
  });

  it("returns an EV-specific addendum for an electric car", async () => {
    const response = await POST(request({ ...validBody, carClass: "electric" }, "203.113.30.8"));
    const body = await response.json();
    expect(body.addendum).toMatch(/battery/i);
  });

  // CAR_BRAND_SPECIFIC_NOTES starts deliberately empty (same discipline
  // as CAR_BENCHMARKED_JOB_TYPES) - nothing has met the "concrete, named
  // research" bar for cars yet, so every brand returns null for now.
  it("returns null brandNotes for every brand - the car notes list starts empty", async () => {
    const response = await POST(request({ ...validBody, brand: "bmw" }, "203.113.30.9"));
    const body = await response.json();
    expect(body.brandNotes).toBeNull();
  });

  it("logs the check anonymised - only carClass, brand and ageBand, nothing identifying", async () => {
    await POST(request(validBody, "203.113.30.10"));

    expect(mocks.logCarBuyingGuideCheck).toHaveBeenCalledWith({
      carClass: "medium",
      brand: "ford",
      ageBand: "used",
    });
  });

  it("rate-limits after too many requests from the same IP within the window", async () => {
    const ip = "198.51.100.63";
    for (let i = 0; i < 20; i++) {
      const response = await POST(request(validBody, ip));
      expect(response.status).toBe(200);
    }

    const limited = await POST(request(validBody, ip));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({ error: "Too many requests. Try again in a minute." });
  });
});
