import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getServiceRecords: vi.fn(),
  getFuelLogs: vi.fn(),
  getMods: vi.fn(),
  updateTrackerDoc: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { query: mocks.query },
  }),
}));
vi.mock("@/lib/tracker/cosmosHelpers", () => ({
  updateTrackerDoc: mocks.updateTrackerDoc,
}));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));

import { POST } from "@/app/api/cron/audit-mileage/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/audit-mileage", { method: "POST", headers });
}

function bikesQuery(bikes: unknown[]) {
  mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: bikes }) });
}

describe("POST /api/cron/audit-mileage", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    process.env.CRON_SECRET = "top-secret";
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getFuelLogs.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
    mocks.updateTrackerDoc.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects a request with no authorization header", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await POST(request({ authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects every request when CRON_SECRET isn't configured, even with a matching-looking header", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(401);
  });

  it("no-ops cleanly when there are no bikes at all", async () => {
    bikesQuery([]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bikesProcessed: 0, recordsFlagged: 0, perBike: [] });
  });

  it("leaves manually-logged records (no mileageConfidence tag) untouched even if mileage looks inconsistent", async () => {
    bikesQuery([{ id: "bike-1", pk: "owner@example.com" }]);
    mocks.getServiceRecords.mockResolvedValue([
      { id: "s1", date: "2025-01-01", mileage: 5000 },
      { id: "s2", date: "2025-02-01", mileage: 4000 }, // decreasing, but never AI-tagged
    ]);

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body).toEqual({ bikesProcessed: 1, recordsFlagged: 0, perBike: [] });
    expect(mocks.updateTrackerDoc).not.toHaveBeenCalled();
  });

  it("flags AI-derived records whose mileage is chronologically inconsistent, downgrading confirmed back to estimated", async () => {
    bikesQuery([{ id: "bike-1", pk: "owner@example.com" }]);
    mocks.getServiceRecords.mockResolvedValue([
      { id: "s1", date: "2025-01-01", mileage: 5000, mileageConfidence: "confirmed" },
      { id: "s2", date: "2025-02-01", mileage: 4000, mileageConfidence: "estimated" },
    ]);

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bikesProcessed).toBe(1);
    expect(body.recordsFlagged).toBe(2);
    expect(body.perBike).toEqual([{ email: "owner@example.com", bikeId: "bike-1", flagged: 2 }]);
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith("owner@example.com", "s1", {
      needsReview: true,
      mileageConfidence: "estimated",
      mileageConflictWarning: expect.stringContaining("chronologically inconsistent"),
    });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith("owner@example.com", "s2", expect.objectContaining({
      mileageConfidence: "estimated",
    }));
  });

  it("checks every bike independently and sums recordsFlagged across all of them", async () => {
    bikesQuery([
      { id: "bike-1", pk: "owner1@example.com" },
      { id: "bike-2", pk: "owner2@example.com" },
    ]);
    mocks.getServiceRecords.mockImplementation(async (email: string) => {
      if (email === "owner1@example.com") {
        return [
          { id: "a1", date: "2025-01-01", mileage: 5000, mileageConfidence: "estimated" },
          { id: "a2", date: "2025-02-01", mileage: 1000, mileageConfidence: "estimated" },
        ];
      }
      return [];
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body.bikesProcessed).toBe(2);
    expect(body.recordsFlagged).toBe(2);
    expect(body.perBike).toEqual([{ email: "owner1@example.com", bikeId: "bike-1", flagged: 2 }]);
  });

  // BUG FINDING: there is no per-bike try/catch around the audit work, so a
  // failure auditing one bike aborts the whole run - later bikes are never
  // even looked at, and the caller only ever sees a bare 500.
  it("aborts the entire run (and never reaches later bikes) when a single bike's own lookup throws", async () => {
    bikesQuery([
      { id: "bike-1", pk: "owner1@example.com" },
      { id: "bike-2", pk: "owner2@example.com" },
    ]);
    mocks.getServiceRecords.mockImplementation(async (email: string) => {
      if (email === "owner1@example.com") throw new Error("Cosmos read failed");
      return [];
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Audit failed.");
    expect(body.detail).toBe("Cosmos read failed");
    // bike-2 was never reached because bike-1's failure propagated straight
    // out of the loop instead of being isolated to that one bike.
    expect(mocks.getServiceRecords).not.toHaveBeenCalledWith("owner2@example.com", "bike-2");
  });
});
