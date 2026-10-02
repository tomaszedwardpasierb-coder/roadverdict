import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getComparisonSummary: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/comparisonSummary", () => ({ getComparisonSummary: mocks.getComparisonSummary }));

import { POST } from "@/app/api/compare/summary/route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/compare/summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  mocks.getComparisonSummary.mockResolvedValue({ ok: true, summary: null });
});

describe("POST /api/compare/summary", () => {
  it("needs a signed-in account", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request({ ids: ["a", "b"] }))).status).toBe(401);
  });

  it("validates the ids and dates", async () => {
    expect((await POST(request("nope"))).status).toBe(400);
    expect((await POST(request({ ids: "a,b" }))).status).toBe(400);
    expect((await POST(request({ ids: ["a", 2] }))).status).toBe(400);
    expect((await POST(request({ ids: ["a", "b"], from: "yesterday" }))).status).toBe(400);
    expect(mocks.getComparisonSummary).not.toHaveBeenCalled();
  });

  it("only checks for a saved summary unless generate is exactly true", async () => {
    await POST(request({ ids: ["a", "b"], generate: "yes" }));
    expect(mocks.getComparisonSummary).toHaveBeenCalledWith("rider@example.com", ["a", "b"], null, false);
  });

  it("passes a date range and a generate request through", async () => {
    mocks.getComparisonSummary.mockResolvedValue({ ok: true, summary: { summary: "S", points: [], generatedAt: "t" } });
    const response = await POST(request({ ids: ["a", "b"], from: "2026-01-01", generate: true }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ summary: { summary: "S", points: [], generatedAt: "t" } });
    expect(mocks.getComparisonSummary).toHaveBeenCalledWith("rider@example.com", ["a", "b"], { from: "2026-01-01", to: undefined }, true);
  });

  it("maps refusals to statuses", async () => {
    mocks.getComparisonSummary.mockResolvedValue({ ok: false, reason: "not_pro" });
    expect((await POST(request({ ids: ["a", "b"] }))).status).toBe(403);
    mocks.getComparisonSummary.mockResolvedValue({ ok: false, reason: "invalid" });
    expect((await POST(request({ ids: ["a", "b"] }))).status).toBe(400);
    mocks.getComparisonSummary.mockResolvedValue({ ok: false, reason: "failed" });
    expect((await POST(request({ ids: ["a", "b"] }))).status).toBe(502);
  });
});
