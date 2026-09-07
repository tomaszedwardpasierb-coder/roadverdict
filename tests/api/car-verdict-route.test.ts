import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  logCarQuoteCheck: vi.fn(),
  getCarCommunityStats: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  logCarQuoteCheck: mocks.logCarQuoteCheck,
  getCarCommunityStats: mocks.getCarCommunityStats,
}));

import { POST } from "@/app/api/cars/verdict/route";

function request(body: unknown, ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/cars/verdict", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function badJsonRequest(ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/cars/verdict", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: "not-json",
  });
}

const validBody = {
  carClass: "medium",
  jobType: "full-service",
  brand: "ford",
  region: "london-se",
  quotedPrice: 250,
};

beforeEach(() => {
  mocks.logCarQuoteCheck.mockReset();
  mocks.getCarCommunityStats.mockReset();
  mocks.getCarCommunityStats.mockReturnValue(null);
});

describe("POST /api/cars/verdict", () => {
  it("rejects malformed JSON without logging anything", async () => {
    const response = await POST(badJsonRequest("203.113.10.1"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
    expect(mocks.logCarQuoteCheck).not.toHaveBeenCalled();
  });

  it("rejects an invalid jobType, with a generic message that leaks no schema internals", async () => {
    const response = await POST(request({ ...validBody, jobType: "engine-rebuild" }, "203.113.10.2"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please check your answers and try again." });
  });

  it("rejects a jobType that's a real CAR_JOB_LABELS key but not yet benchmarked (e.g. 'cambelt')", async () => {
    const response = await POST(request({ ...validBody, jobType: "cambelt" }, "203.113.10.3"));
    expect(response.status).toBe(400);
  });

  it("rejects an electric carClass (not benchmarked - see the ADR's Phase 7 scope cut)", async () => {
    const response = await POST(request({ ...validBody, carClass: "electric" }, "203.113.10.4"));
    expect(response.status).toBe(400);
  });

  it("rejects a quotedPrice of zero or below", async () => {
    const response = await POST(request({ ...validBody, quotedPrice: 0 }, "203.113.10.5"));
    expect(response.status).toBe(400);
  });

  it("rejects an implausibly large quotedPrice", async () => {
    const response = await POST(request({ ...validBody, quotedPrice: 50000 }, "203.113.10.6"));
    expect(response.status).toBe(400);
  });

  it("rejects an invalid brand", async () => {
    const response = await POST(request({ ...validBody, brand: "not-a-brand" }, "203.113.10.7"));
    expect(response.status).toBe(400);
  });

  it("returns a fair verdict for a quote within the typical range", async () => {
    const response = await POST(request({ ...validBody, quotedPrice: 1 }, "203.113.10.8"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.verdict).toBe("fair");
    expect(body.range).toEqual({ low: expect.any(Number), high: expect.any(Number) });
    expect(body.brandLabel).toBe("Ford");
    expect(body.regionLabel).toBe("London & South East");
  });

  it("returns a second-opinion verdict for a wildly excessive quote", async () => {
    const response = await POST(request({ ...validBody, quotedPrice: 4999 }, "203.113.10.9"));
    const body = await response.json();
    expect(body.verdict).toBe("second-opinion");
  });

  it("logs the check anonymised - job type, car class, price, verdict, brand, region only", async () => {
    await POST(request(validBody, "203.113.10.10"));

    expect(mocks.logCarQuoteCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "full-service",
        carClass: "medium",
        quotedPrice: 250,
        brand: "ford",
        region: "london-se",
        verdict: expect.any(String),
      })
    );
  });

  it("includes community stats in the response when available", async () => {
    mocks.getCarCommunityStats.mockReturnValue({ sampleSize: 12, low: 200, high: 300 });

    const response = await POST(request(validBody, "203.113.10.11"));
    const body = await response.json();
    expect(body.communityStats).toEqual({ sampleSize: 12, low: 200, high: 300 });
  });

  it("returns null community stats when there isn't enough sample data yet", async () => {
    const response = await POST(request(validBody, "203.113.10.12"));
    const body = await response.json();
    expect(body.communityStats).toBeNull();
  });

  it("rate-limits after too many requests from the same IP within the window", async () => {
    const ip = "198.51.100.61";
    for (let i = 0; i < 20; i++) {
      const response = await POST(request(validBody, ip));
      expect(response.status).toBe(200);
    }

    const limited = await POST(request(validBody, ip));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({ error: "Too many requests. Try again in a minute." });
  });
});
