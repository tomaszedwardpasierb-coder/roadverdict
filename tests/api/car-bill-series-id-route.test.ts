// Mirrors bill-series-id-route.test.ts for the car equivalent route.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  endCarBillSeries: vi.fn(),
  deleteCarRemindersBySourceKey: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getPrimaryCar: mocks.getPrimaryCar,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carBillSeries", () => ({ endCarBillSeries: mocks.endCarBillSeries }));
vi.mock("@/lib/tracker/carReminder", () => ({ deleteCarRemindersBySourceKey: mocks.deleteCarRemindersBySourceKey }));

import { PATCH } from "@/app/api/cars/car-bill-series/[id]/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-bill-series/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
}

const ownId = "owner@example.com::carBillSeries::abc123";

describe("PATCH /api/cars/car-bill-series/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1" });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.endCarBillSeries.mockResolvedValue({ id: ownId, status: "ended" });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify({ action: "end" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling endCarBillSeries", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(
      request(JSON.stringify({ action: "end" })),
      { params: Promise.resolve({ id: "attacker@example.com::carBillSeries::abc123" }) }
    );
    expect(response.status).toBe(404);
    expect(mocks.endCarBillSeries).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request("not-json"), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(400);
  });

  it("rejects an unsupported action", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify({ action: "edit" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(400);
    expect(mocks.endCarBillSeries).not.toHaveBeenCalled();
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await PATCH(request(JSON.stringify({ action: "end" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.endCarBillSeries).not.toHaveBeenCalled();
  });

  it("returns not found when there's no such series", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.endCarBillSeries.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify({ action: "end" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(404);
  });

  it("ends the plan and clears its renewal reminder", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify({ action: "end" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.endCarBillSeries).toHaveBeenCalledWith("owner@example.com", ownId);
    expect(mocks.deleteCarRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "car-1", `bill-series:${ownId}`);
  });
});
