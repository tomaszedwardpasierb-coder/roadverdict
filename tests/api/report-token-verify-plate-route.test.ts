import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyPlate: vi.fn(),
  grantReportAccess: vi.fn(),
  checkPlateRateLimit: vi.fn(),
  recordPlateAttempt: vi.fn(),
}));

vi.mock("@/lib/tracker/reportAccess", () => ({
  verifyPlate: mocks.verifyPlate,
  grantReportAccess: mocks.grantReportAccess,
  checkPlateRateLimit: mocks.checkPlateRateLimit,
  recordPlateAttempt: mocks.recordPlateAttempt,
}));

import { POST } from "@/app/api/report/[token]/verify-plate/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/report/tok-a/verify-plate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/report/[token]/verify-plate", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.checkPlateRateLimit.mockResolvedValue({ allowed: true });
    mocks.recordPlateAttempt.mockResolvedValue(undefined);
    mocks.verifyPlate.mockResolvedValue(true);
    mocks.grantReportAccess.mockResolvedValue({
      cookieName: "rv_report_abc123",
      cookieValue: "raw-session-value",
      maxAge: 604800,
    });
  });

  it("returns 429 when the per-token rate limit has been exhausted, without checking the plate at all", async () => {
    mocks.checkPlateRateLimit.mockResolvedValue({ allowed: false });

    const response = await POST(request(JSON.stringify({ plate: "AB12CDE" })), { params: { token: "tok-a" } });

    expect(response.status).toBe(429);
    expect(mocks.verifyPlate).not.toHaveBeenCalled();
    expect(mocks.recordPlateAttempt).not.toHaveBeenCalled();
  });

  it("checks the rate limit scoped to this token specifically", async () => {
    await POST(request(JSON.stringify({ plate: "AB12CDE" })), { params: { token: "tok-a" } });
    expect(mocks.checkPlateRateLimit).toHaveBeenCalledWith("tok-a");
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"), { params: { token: "tok-a" } });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    expect(mocks.recordPlateAttempt).not.toHaveBeenCalled();
  });

  it("rejects a missing plate", async () => {
    const response = await POST(request(JSON.stringify({})), { params: { token: "tok-a" } });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please enter the registration number." });
  });

  it("rejects a non-string plate", async () => {
    const response = await POST(request(JSON.stringify({ plate: 12345 })), { params: { token: "tok-a" } });
    expect(response.status).toBe(400);
  });

  it("records the attempt against this token even when the plate turns out to be wrong", async () => {
    mocks.verifyPlate.mockResolvedValue(false);

    const response = await POST(request(JSON.stringify({ plate: "WRONG1" })), { params: { token: "tok-a" } });

    expect(mocks.recordPlateAttempt).toHaveBeenCalledWith("tok-a");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "That doesn't match this bike's registration. Please check and try again.",
    });
    expect(mocks.grantReportAccess).not.toHaveBeenCalled();
  });

  it("verifies the plate against this specific token's bike, not any other", async () => {
    await POST(request(JSON.stringify({ plate: "AB12CDE" })), { params: { token: "tok-a" } });
    expect(mocks.verifyPlate).toHaveBeenCalledWith("tok-a", "AB12CDE");
  });

  it("grants access and sets the per-report cookie on a correct plate", async () => {
    const response = await POST(request(JSON.stringify({ plate: "AB12CDE" })), { params: { token: "tok-a" } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    const cookie = response.cookies.get("rv_report_abc123");
    expect(cookie?.value).toBe("raw-session-value");
  });

  it("sets the access cookie as httpOnly, secure, sameSite lax, and path '/' so it also reaches /api/report/[token]/* calls", async () => {
    const response = await POST(request(JSON.stringify({ plate: "AB12CDE" })), { params: { token: "tok-a" } });

    const cookie = response.cookies.get("rv_report_abc123");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
    expect(cookie?.maxAge).toBe(604800);
  });

  it("derives access from this token's own grantReportAccess call, not a hardcoded/shared cookie name", async () => {
    mocks.grantReportAccess.mockResolvedValue({
      cookieName: "rv_report_different_hash",
      cookieValue: "other-raw-value",
      maxAge: 100,
    });

    const response = await POST(request(JSON.stringify({ plate: "AB12CDE" })), { params: { token: "tok-b" } });

    expect(response.cookies.get("rv_report_abc123")).toBeUndefined();
    expect(response.cookies.get("rv_report_different_hash")?.value).toBe("other-raw-value");
  });
});
