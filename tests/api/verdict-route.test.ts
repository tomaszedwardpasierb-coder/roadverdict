import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  logQuoteCheck: vi.fn(),
  getCommunityStats: vi.fn(),
  generateQuoteAdvice: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  logQuoteCheck: mocks.logQuoteCheck,
  getCommunityStats: mocks.getCommunityStats,
}));
vi.mock("@/lib/tracker/quoteAdvice", () => ({ generateQuoteAdvice: mocks.generateQuoteAdvice }));

import { POST } from "@/app/api/verdict/route";

function request(body: unknown, ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/verdict", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function badJsonRequest(ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/verdict", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: "not-json",
  });
}

const validBody = {
  bikeClass: "medium",
  jobType: "full-service",
  brand: "honda",
  region: "london-se",
  quotedPrice: 200,
};

beforeEach(() => {
  mocks.logQuoteCheck.mockReset();
  mocks.getCommunityStats.mockReset();
  mocks.generateQuoteAdvice.mockReset();
  mocks.getCommunityStats.mockReturnValue(null);
  mocks.generateQuoteAdvice.mockResolvedValue(null);
  delete process.env.GEMINI_API_KEY;
});

describe("POST /api/verdict", () => {
  it("rejects malformed JSON without logging anything", async () => {
    const response = await POST(badJsonRequest("203.0.113.40"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
    expect(mocks.logQuoteCheck).not.toHaveBeenCalled();
  });

  it("rejects an invalid jobType, with a generic message that leaks no schema internals", async () => {
    const response = await POST(request({ ...validBody, jobType: "engine-rebuild" }, "203.0.113.41"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please check your answers and try again." });
  });

  it("rejects a quotedPrice of zero or below", async () => {
    const response = await POST(request({ ...validBody, quotedPrice: 0 }, "203.0.113.42"));
    expect(response.status).toBe(400);
  });

  it("rejects an implausibly large quotedPrice", async () => {
    const response = await POST(request({ ...validBody, quotedPrice: 50000 }, "203.0.113.43"));
    expect(response.status).toBe(400);
  });

  it("rejects an invalid bikeClass/brand/region", async () => {
    const response = await POST(request({ ...validBody, brand: "not-a-brand" }, "203.0.113.44"));
    expect(response.status).toBe(400);
  });

  it("returns a fair verdict for a quote within the typical range", async () => {
    // full-service/medium/honda/london-se benchmark comfortably covers 200
    const response = await POST(request({ ...validBody, quotedPrice: 50 }, "203.0.113.45"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.verdict).toBe("fair");
    expect(body.range).toEqual({ low: expect.any(Number), high: expect.any(Number) });
    expect(body.brandLabel).toBe("Honda");
    expect(body.regionLabel).toBe("London & South East");
  });

  it("returns a second-opinion verdict for a wildly excessive quote", async () => {
    const response = await POST(request({ ...validBody, quotedPrice: 4999 }, "203.0.113.46"));
    const body = await response.json();
    expect(body.verdict).toBe("second-opinion");
  });

  it("logs the check anonymised - job type, bike class, price, verdict, brand, region only", async () => {
    await POST(request(validBody, "203.0.113.47"));

    expect(mocks.logQuoteCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "full-service",
        bikeClass: "medium",
        quotedPrice: 200,
        brand: "honda",
        region: "london-se",
        verdict: expect.any(String),
      })
    );
  });

  it("includes community stats in the response when available", async () => {
    mocks.getCommunityStats.mockReturnValue({ sampleSize: 12, low: 150, high: 250 });

    const response = await POST(request(validBody, "203.0.113.48"));
    const body = await response.json();
    expect(body.communityStats).toEqual({ sampleSize: 12, low: 150, high: 250 });
  });

  it("returns null community stats when there isn't enough sample data yet", async () => {
    mocks.getCommunityStats.mockReturnValue(null);

    const response = await POST(request(validBody, "203.0.113.49"));
    const body = await response.json();
    expect(body.communityStats).toBeNull();
  });

  it("does not call generateQuoteAdvice when GEMINI_API_KEY is absent, and advice is null", async () => {
    const response = await POST(request(validBody, "203.0.113.50"));
    const body = await response.json();
    expect(mocks.generateQuoteAdvice).not.toHaveBeenCalled();
    expect(body.advice).toBeNull();
  });

  it("calls generateQuoteAdvice and includes its result when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateQuoteAdvice.mockResolvedValue({ summary: "This looks like a fair price." });

    const response = await POST(request(validBody, "203.0.113.51"));
    const body = await response.json();

    expect(mocks.generateQuoteAdvice).toHaveBeenCalledOnce();
    expect(body.advice).toEqual({ summary: "This looks like a fair price." });
  });

  it("still returns a working verdict even if generateQuoteAdvice returns null despite the key being set", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateQuoteAdvice.mockResolvedValue(null);

    const response = await POST(request(validBody, "203.0.113.52"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.advice).toBeNull();
    expect(body.verdict).toBeDefined();
  });

  it("rate-limits after too many requests from the same IP within the window", async () => {
    const ip = "198.51.100.60";
    for (let i = 0; i < 20; i++) {
      const response = await POST(request(validBody, ip));
      expect(response.status).toBe(200);
    }

    const limited = await POST(request(validBody, ip));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({ error: "Too many requests. Try again in a minute." });
  });
});
