import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getServiceRecords: vi.fn(),
  getFuelLogs: vi.fn(),
  getMods: vi.fn(),
  getBills: vi.fn(),
  getPrimaryBike: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/bill", () => ({ getBills: mocks.getBills }));
vi.mock("@/lib/tracker/bike", () => ({ getPrimaryBike: mocks.getPrimaryBike }));
// checkMileageConsistency is deliberately NOT mocked - it's already
// covered by its own dedicated unit tests (mileageCheck.test.ts), so
// these tests exercise the real function to prove the route's own
// wiring (history assembly, target lookup, response shape) is correct.

import { GET } from "@/app/api/tracker/mileage-conflict-lookup/route";

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/tracker/mileage-conflict-lookup${query}`, { method: "GET" });
}

const email = "owner@example.com";
const id = `${email}::sr::1`;
const bike = { id: "bike-1", currentMileage: 9000 };

describe("GET /api/tracker/mileage-conflict-lookup", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSession.mockResolvedValue({ email });
    mocks.getPrimaryBike.mockResolvedValue(bike);
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getFuelLogs.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
    mocks.getBills.mockResolvedValue([]);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request(`?category=service&id=${id}`));
    expect(response.status).toBe(401);
  });

  it("rejects a missing id or an unknown category", async () => {
    const response = await GET(request("?category=made-up"));
    expect(response.status).toBe(400);
  });

  it("returns 404 (not the record) when the id doesn't belong to the signed-in account", async () => {
    const response = await GET(request(`?category=service&id=stranger@example.com::sr::1`));
    expect(response.status).toBe(404);
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await GET(request(`?category=service&id=${id}`));
    expect(response.status).toBe(404);
  });

  it("returns 404 when no entry with that id exists in the target category", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "some-other-id", date: "2025-01-01", mileage: 5000 }]);
    const response = await GET(request(`?category=service&id=${id}`));
    expect(response.status).toBe(404);
  });

  it("returns 404 when the target entry has no mileage recorded", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id, date: "2025-01-01", mileage: null }]);
    const response = await GET(request(`?category=service&id=${id}`));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "This entry has no mileage recorded." });
  });

  // Real conflict: the target is earlier in time but claims a HIGHER
  // mileage than a later fuel log - genuinely inconsistent.
  it("finds and reports a genuine conflict against a later, lower-mileage fuel log", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id, date: "2025-01-01", mileage: 5000 }]);
    mocks.getFuelLogs.mockResolvedValue([{ id: "fl-1", date: "2025-02-01", mileage: 4900 }]);

    const response = await GET(request(`?category=service&id=${id}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ referenceId: "fl-1", referenceCategory: "fuel" });
  });

  it("only includes MOT-type bills with a recorded mileage in the comparison history, not every bill", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id, date: "2025-01-01", mileage: 5000 }]);
    mocks.getBills.mockResolvedValue([
      { id: "bl-1", billType: "mot-test", date: "2025-02-01", mileage: 4900 },
      { id: "bl-2", billType: "insurance", date: "2025-02-02", mileage: 4800 }, // not MOT - excluded
      { id: "bl-3", billType: "mot-test", date: "2025-02-03", mileage: null }, // MOT but no mileage - excluded
    ]);

    const response = await GET(request(`?category=service&id=${id}`));

    await expect(response.json()).resolves.toEqual({ referenceId: "bl-1", referenceCategory: "mot" });
  });

  // Explicit guarantee in the source comment: the check is re-run live
  // rather than trusting a stale stored warning, so a since-resolved
  // conflict correctly reports "nothing found" rather than stale data.
  it("reports 404 when re-running the check finds no current conflict (already resolved)", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id, date: "2025-01-01", mileage: 5000 }]);
    const response = await GET(request(`?category=service&id=${id}`));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "No current conflict found for this entry - it may have already been resolved.",
    });
  });
});