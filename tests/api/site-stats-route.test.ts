import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  getSiteStats: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/monitoring/appInsights", () => ({ getSiteStats: mocks.getSiteStats }));

import { GET } from "@/app/api/tomasz/site-stats/route";

function request(hours?: string): NextRequest {
  const url = hours
    ? `http://localhost/api/tomasz/site-stats?hours=${hours}`
    : "http://localhost/api/tomasz/site-stats";
  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/tomasz/site-stats", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSiteStats.mockResolvedValue({ requests: 100 });
  });

  it("rejects a non-admin request outright, without ever querying stats", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.getSiteStats).not.toHaveBeenCalled();
  });

  it("rejects a request with no admin session cookie at all", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await GET(request());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("defaults to a 24 hour window when no hours param is given", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await GET(request());
    expect(mocks.getSiteStats).toHaveBeenCalledWith(24);
  });

  it("uses a valid custom hours value", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await GET(request("48"));
    expect(mocks.getSiteStats).toHaveBeenCalledWith(48);
  });

  it("clamps an hours value above the 168 hour maximum", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await GET(request("999"));
    expect(mocks.getSiteStats).toHaveBeenCalledWith(168);
  });

  it("clamps a negative hours value up to the 1 hour minimum", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await GET(request("-5"));
    expect(mocks.getSiteStats).toHaveBeenCalledWith(1);
  });

  it("falls back to the 24 hour default for a non-numeric hours value", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await GET(request("not-a-number"));
    expect(mocks.getSiteStats).toHaveBeenCalledWith(24);
  });

  // 0 is falsy, so `Number(...) || 24` treats an explicit "0" the same
  // as "absent" and falls back to the 24 hour default, rather than
  // clamping it up to the 1 hour minimum.
  it("treats an explicit hours=0 the same as absent (falls back to 24), due to the || default", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await GET(request("0"));
    expect(mocks.getSiteStats).toHaveBeenCalledWith(24);
  });

  it("returns the stats for an admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.getSiteStats.mockResolvedValue({ requests: 250, errors: 3 });
    const response = await GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ requests: 250, errors: 3 });
  });

  it("returns 502 with a detail message when the underlying stats query fails", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.getSiteStats.mockRejectedValue(new Error("app insights unavailable"));
    const response = await GET(request());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to load site stats.",
      detail: "app insights unavailable",
    });
  });
});
