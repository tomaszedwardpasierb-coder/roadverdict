import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  createBillSeries: vi.fn(),
  materializeDueInstalments: vi.fn(),
  materializeExactCount: vi.fn(),
  seriesEndDate: vi.fn(),
  createReminder: vi.fn(),
  deleteRemindersBySourceKey: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/billSeries", () => ({
  createBillSeries: mocks.createBillSeries,
  materializeDueInstalments: mocks.materializeDueInstalments,
  materializeExactCount: mocks.materializeExactCount,
  seriesEndDate: mocks.seriesEndDate,
}));
vi.mock("@/lib/tracker/reminder", () => ({
  createReminder: mocks.createReminder,
  deleteRemindersBySourceKey: mocks.deleteRemindersBySourceKey,
}));
// productionYearCheck.ts and billTypes.ts are deliberately NOT mocked -
// both are pure, no I/O, same reasoning as the plain bills route's own tests.

import { POST } from "@/app/api/tracker/bill-series/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bill-series", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validInsurancePlan = {
  billType: "insurance",
  frequency: "monthly",
  startDate: "2025-06-01",
  collectionDay: 1,
  depositAmount: 110,
  instalmentAmount: 42.5,
  instalmentCount: 12,
};

describe("POST /api/tracker/bill-series", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", year: 2018, currentMileage: 5000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.createBillSeries.mockResolvedValue({ id: "series-1", bikeId: "bike-1" });
    mocks.materializeDueInstalments.mockResolvedValue([]);
    mocks.materializeExactCount.mockResolvedValue([]);
    mocks.seriesEndDate.mockReturnValue("2026-06-01");
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify(validInsurancePlan)));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a bill type that can't be a plan (e.g. mot-test)", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validInsurancePlan, billType: "mot-test" })));
    expect(response.status).toBe(400);
    expect(mocks.createBillSeries).not.toHaveBeenCalled();
  });

  it("rejects an invalid frequency", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validInsurancePlan, frequency: "weekly" })));
    expect(response.status).toBe(400);
  });

  it("rejects a collection day outside 1-28", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validInsurancePlan, collectionDay: 30 })));
    expect(response.status).toBe(400);
  });

  it("rejects an instalment count below 1", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validInsurancePlan, instalmentCount: 0 })));
    expect(response.status).toBe(400);
  });

  // Road tax has no deposit concept - DVLA's own scheme is equal
  // instalments plus a flat surcharge, never a front-loaded first payment.
  it("rejects a deposit on a road-tax plan", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({
      billType: "road-tax", frequency: "monthly", startDate: "2025-06-01",
      collectionDay: 1, depositAmount: 50, instalmentAmount: 30, instalmentCount: 12,
    })));
    expect(response.status).toBe(400);
    expect(mocks.createBillSeries).not.toHaveBeenCalled();
  });

  it("returns not found when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify(validInsurancePlan)));
    expect(response.status).toBe(404);
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify(validInsurancePlan)));
    expect(response.status).toBe(403);
    expect(mocks.createBillSeries).not.toHaveBeenCalled();
  });

  it("rejects a start date before the bike's production year", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validInsurancePlan, startDate: "2015-01-01" })));
    expect(response.status).toBe(400);
    expect(mocks.createBillSeries).not.toHaveBeenCalled();
  });

  it("creates the series, materialises whatever's due immediately, and creates a renewal reminder", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify(validInsurancePlan)));

    expect(response.status).toBe(200);
    expect(mocks.createBillSeries).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      bikeId: "bike-1", billType: "insurance", instalmentAmount: 42.5, depositAmount: 110,
    }));
    expect(mocks.materializeDueInstalments).toHaveBeenCalledWith("owner@example.com", { id: "series-1", bikeId: "bike-1" });
    expect(mocks.deleteRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "bike-1", "bill-series:series-1");
    expect(mocks.createReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      bikeId: "bike-1",
      intervalType: "date",
      exactDate: "2026-06-01",
      sourceKey: "bill-series:series-1",
    }));
  });

  it("rejects a negative instalmentsAlreadyPaid", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validInsurancePlan, instalmentsAlreadyPaid: -1 })));
    expect(response.status).toBe(400);
    expect(mocks.createBillSeries).not.toHaveBeenCalled();
  });

  it("rejects instalmentsAlreadyPaid greater than the plan's own instalmentCount", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validInsurancePlan, instalmentsAlreadyPaid: 13 })));
    expect(response.status).toBe(400);
    expect(mocks.createBillSeries).not.toHaveBeenCalled();
  });

  it("materialises by explicit count, not date arithmetic, when instalmentsAlreadyPaid is given", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validInsurancePlan, instalmentsAlreadyPaid: 3 })));

    expect(response.status).toBe(200);
    expect(mocks.materializeExactCount).toHaveBeenCalledWith("owner@example.com", { id: "series-1", bikeId: "bike-1" }, 3);
    expect(mocks.materializeDueInstalments).not.toHaveBeenCalled();
  });

  it("falls back to date-arithmetic materialisation when instalmentsAlreadyPaid is 0 or omitted", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request(JSON.stringify({ ...validInsurancePlan, instalmentsAlreadyPaid: 0 })));

    expect(mocks.materializeDueInstalments).toHaveBeenCalledWith("owner@example.com", { id: "series-1", bikeId: "bike-1" });
    expect(mocks.materializeExactCount).not.toHaveBeenCalled();
  });

  it("never sends a deposit through for a road-tax plan, even if the client didn't", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request(JSON.stringify({
      billType: "road-tax", frequency: "six-monthly", startDate: "2025-06-01",
      collectionDay: 1, instalmentAmount: 60, instalmentCount: 2,
    })));
    const payload = mocks.createBillSeries.mock.calls[0][1];
    expect(payload.depositAmount).toBeUndefined();
  });

  it("accepts finance as a plannable bill type, deposit included - vehicle finance commonly has a down payment", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({
      billType: "finance", frequency: "monthly", startDate: "2025-06-01",
      collectionDay: 1, depositAmount: 500, instalmentAmount: 220, instalmentCount: 36,
    })));

    expect(response.status).toBe(200);
    expect(mocks.createBillSeries).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      billType: "finance", depositAmount: 500, instalmentAmount: 220,
    }));
  });
});
