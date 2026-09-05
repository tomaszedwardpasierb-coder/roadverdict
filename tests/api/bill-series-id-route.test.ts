import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  endBillSeries: vi.fn(),
  deleteRemindersBySourceKey: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/billSeries", () => ({ endBillSeries: mocks.endBillSeries }));
vi.mock("@/lib/tracker/reminder", () => ({ deleteRemindersBySourceKey: mocks.deleteRemindersBySourceKey }));

import { PATCH } from "@/app/api/tracker/bill-series/[id]/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bill-series/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
}

const ownId = "owner@example.com::billSeries::abc123";

describe("PATCH /api/tracker/bill-series/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1" });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.endBillSeries.mockResolvedValue({ id: ownId, status: "ended" });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify({ action: "end" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling endBillSeries", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(
      request(JSON.stringify({ action: "end" })),
      { params: Promise.resolve({ id: "attacker@example.com::billSeries::abc123" }) }
    );
    expect(response.status).toBe(404);
    expect(mocks.endBillSeries).not.toHaveBeenCalled();
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
    expect(mocks.endBillSeries).not.toHaveBeenCalled();
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await PATCH(request(JSON.stringify({ action: "end" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.endBillSeries).not.toHaveBeenCalled();
  });

  it("returns not found when there's no such series", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.endBillSeries.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify({ action: "end" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(404);
  });

  it("ends the plan and clears its renewal reminder", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify({ action: "end" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.endBillSeries).toHaveBeenCalledWith("owner@example.com", ownId);
    expect(mocks.deleteRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "bike-1", `bill-series:${ownId}`);
  });
});
