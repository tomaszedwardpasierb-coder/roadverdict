// Mirrors report-token-verify-plate-route.test.ts for the car equivalent route.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyCarPlate: vi.fn(),
  grantReportAccess: vi.fn(),
  checkPlateRateLimit: vi.fn(),
  recordPlateAttempt: vi.fn(),
}));

vi.mock("@/lib/tracker/carReportAccess", () => ({
  verifyCarPlate: mocks.verifyCarPlate,
}));
vi.mock("@/lib/tracker/reportAccess", () => ({
  grantReportAccess: mocks.grantReportAccess,
  checkPlateRateLimit: mocks.checkPlateRateLimit,
  recordPlateAttempt: mocks.recordPlateAttempt,
}));

import { POST } from "@/app/api/car-report/[token]/verify-plate/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/car-report/tok-a/verify-plate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/car-report/[token]/verify-plate", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.checkPlateRateLimit.mockResolvedValue({ allowed: true });
    mocks.recordPlateAttempt.mockResolvedValue(undefined);
    mocks.verifyCarPlate.mockResolvedValue(true);
    mocks.grantReportAccess.mockResolvedValue({
      cookieName: "rv_report_abc123",
      cookieValue: "raw-session-value",
      maxAge: 604800,
    });
  });

  it("returns 429 when the per-token rate limit has been exhausted, without checking the plate at all", async () => {
    mocks.checkPlateRateLimit.mockResolvedValue({ allowed: false });

    const response = await POST(request(JSON.stringify({ plate: "AB12CDE" })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(429);
    expect(mocks.verifyCarPlate).not.toHaveBeenCalled();
    expect(mocks.recordPlateAttempt).not.toHaveBeenCalled();
  });

  it("checks the rate limit scoped to this token specifically", async () => {
    await POST(request(JSON.stringify({ plate: "AB12CDE" })), { params: Promise.resolve({ token: "tok-a" }) });
    expect(mocks.checkPlateRateLimit).toHaveBeenCalledWith("tok-a");
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"), { params: Promise.resolve({ token: "tok-a" }) });
    expect(response.status).toBe(400);
    expect(mocks.recordPlateAttempt).not.toHaveBeenCalled();
  });

  it("rejects a missing plate", async () => {
    const response = await POST(request(JSON.stringify({})), { params: Promise.resolve({ token: "tok-a" }) });
    expect(response.status).toBe(400);
  });

  it("records the attempt against this token even when the plate turns out to be wrong", async () => {
    mocks.verifyCarPlate.mockResolvedValue(false);

    const response = await POST(request(JSON.stringify({ plate: "WRONG1" })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(mocks.recordPlateAttempt).toHaveBeenCalledWith("tok-a");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "That doesn't match this car's registration. Please check and try again.",
    });
    expect(mocks.grantReportAccess).not.toHaveBeenCalled();
  });

  it("verifies the plate against this specific token's car, not any other", async () => {
    await POST(request(JSON.stringify({ plate: "AB12CDE" })), { params: Promise.resolve({ token: "tok-a" }) });
    expect(mocks.verifyCarPlate).toHaveBeenCalledWith("tok-a", "AB12CDE");
  });

  it("grants access and sets the per-report cookie on a correct plate", async () => {
    const response = await POST(request(JSON.stringify({ plate: "AB12CDE" })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    const cookie = response.cookies.get("rv_report_abc123");
    expect(cookie?.value).toBe("raw-session-value");
  });

  it("sets the access cookie as httpOnly, secure, sameSite lax, and path '/'", async () => {
    const response = await POST(request(JSON.stringify({ plate: "AB12CDE" })), { params: Promise.resolve({ token: "tok-a" }) });

    const cookie = response.cookies.get("rv_report_abc123");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
    expect(cookie?.maxAge).toBe(604800);
  });
});
