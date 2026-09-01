import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  logBuyingGuideCheck: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ logBuyingGuideCheck: mocks.logBuyingGuideCheck }));

import { POST } from "@/app/api/buying-guide/route";

function request(body: unknown, ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/buying-guide", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function badJsonRequest(ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/buying-guide", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: "not-json",
  });
}

const validBody = { bikeClass: "medium", brand: "honda", ageBand: "used" };

beforeEach(() => {
  mocks.logBuyingGuideCheck.mockReset();
});

describe("POST /api/buying-guide", () => {
  it("rejects malformed JSON without logging anything", async () => {
    const response = await POST(badJsonRequest("203.0.113.10"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
    expect(mocks.logBuyingGuideCheck).not.toHaveBeenCalled();
  });

  it("rejects an invalid bikeClass", async () => {
    const response = await POST(request({ ...validBody, bikeClass: "huge" }, "203.0.113.11"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please check your answers and try again." });
  });

  it("rejects an invalid brand", async () => {
    const response = await POST(request({ ...validBody, brand: "not-a-real-brand" }, "203.0.113.12"));
    expect(response.status).toBe(400);
  });

  it("rejects an invalid ageBand", async () => {
    const response = await POST(request({ ...validBody, ageBand: "vintage" }, "203.0.113.13"));
    expect(response.status).toBe(400);
  });

  it("rejects a request missing required fields", async () => {
    const response = await POST(request({ bikeClass: "medium" }, "203.0.113.14"));
    expect(response.status).toBe(400);
  });

  it("returns a well-formed checklist for a valid request", async () => {
    const response = await POST(request(validBody, "203.0.113.15"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ageBandLabel).toBe("Used (2000–2014)");
    expect(body.bikeClassLabel).toBe("Medium (401-750cc)");
    expect(body.brandLabel).toBe("Honda");
    expect(body.checklist).toBeDefined();
    expect(body.addendum).toBeDefined();
  });

  it("returns null brandNotes for a brand with no specific notes on file", async () => {
    const response = await POST(request({ ...validBody, brand: "yamaha" }, "203.0.113.16"));
    const body = await response.json();
    expect(body.brandNotes).toBeNull();
  });

  it("returns brand-specific notes for a brand that has them", async () => {
    const response = await POST(request({ ...validBody, brand: "royal-enfield" }, "203.0.113.17"));
    const body = await response.json();
    expect(body.brandNotes).not.toBeNull();
  });

  it("logs the check anonymised - only bikeClass, brand and ageBand, nothing identifying", async () => {
    await POST(request(validBody, "203.0.113.18"));

    expect(mocks.logBuyingGuideCheck).toHaveBeenCalledWith({
      bikeClass: "medium",
      brand: "honda",
      ageBand: "used",
    });
  });

  it("rate-limits after too many requests from the same IP within the window", async () => {
    const ip = "198.51.100.42";
    for (let i = 0; i < 20; i++) {
      const response = await POST(request(validBody, ip));
      expect(response.status).toBe(200);
    }

    const limited = await POST(request(validBody, ip));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({ error: "Too many requests. Try again in a minute." });
  });

  it("does not rate-limit a different IP even after the first IP is exhausted", async () => {
    const ip = "198.51.100.43";
    for (let i = 0; i < 20; i++) {
      await POST(request(validBody, ip));
    }
    await POST(request(validBody, ip)); // this IP is now limited

    const otherIp = "198.51.100.44";
    const response = await POST(request(validBody, otherIp));
    expect(response.status).toBe(200);
  });
});
