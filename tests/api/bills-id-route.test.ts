import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  updateBill: vi.fn(),
  deleteBill: vi.fn(),
  createReminder: vi.fn(),
  deleteRemindersBySourceKey: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/bill", () => ({ updateBill: mocks.updateBill, deleteBill: mocks.deleteBill }));
vi.mock("@/lib/tracker/reminder", () => ({
  createReminder: mocks.createReminder,
  deleteRemindersBySourceKey: mocks.deleteRemindersBySourceKey,
}));

import { PATCH, DELETE } from "@/app/api/tracker/bills/[id]/route";

function request(body?: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bills/x", {
    method: body ? "PATCH" : "DELETE",
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  });
}

const ownId = "owner@example.com::bill::abc123";
const validPayload = { billType: "insurance", cost: 320, date: "2025-06-01" };

describe("PATCH /api/tracker/bills/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", currentMileage: 5000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.updateBill.mockResolvedValue({ id: ownId });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request("{}"), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  // The core ownership gate: the id itself carries the owner's email as
  // a prefix, checked by simple string comparison before Cosmos is ever
  // touched. An id prefixed with someone else's email must be refused
  // outright, not looked up and then denied.
  it("refuses an id prefixed with a different owner's email, without ever calling updateBill", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const someoneElsesId = "attacker@example.com::bill::abc123";

    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: someoneElsesId }) });

    expect(response.status).toBe(404);
    expect(mocks.updateBill).not.toHaveBeenCalled();
  });

  it("decodes a URL-encoded id before checking its ownership prefix", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const encoded = encodeURIComponent(ownId);

    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: encoded }) });

    expect(response.status).toBe(200);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request("not-json"), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(400);
  });

  it("rejects an incomplete payload", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify({ billType: "insurance" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(400);
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.updateBill).not.toHaveBeenCalled();
  });

  it("returns not found when the update itself finds nothing to update", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateBill.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(404);
  });

  it("updates a valid bill with no reminder requested", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.createReminder).not.toHaveBeenCalled();
  });

  it("clears any existing reminder for the bill type before creating a new one, same as the create route", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await PATCH(
      request(JSON.stringify({ ...validPayload, reminder: { intervalType: "months", intervalValue: 12 } })),
      { params: Promise.resolve({ id: ownId }) }
    );
    expect(mocks.deleteRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "bike-1", "bill:insurance");
    expect(mocks.createReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ sourceKey: "bill:insurance" }));
  });
});

describe("DELETE /api/tracker/bills/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1" });
    mocks.isBikeReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling deleteBill", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: "attacker@example.com::bill::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.deleteBill).not.toHaveBeenCalled();
  });

  it("blocks deletes on a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.deleteBill).not.toHaveBeenCalled();
  });

  it("deletes a valid, owned bill", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.deleteBill).toHaveBeenCalledWith("owner@example.com", ownId);
  });
});