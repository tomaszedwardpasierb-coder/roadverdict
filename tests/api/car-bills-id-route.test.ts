import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCarById: vi.fn(),
  getPrimaryCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  updateCarBill: vi.fn(),
  deleteCarBill: vi.fn(),
  createCarReminder: vi.fn(),
  deleteCarRemindersBySourceKey: vi.fn(),
  getTrackerDocById: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getCarById: mocks.getCarById,
  getPrimaryCar: mocks.getPrimaryCar,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carBill", () => ({ updateCarBill: mocks.updateCarBill, deleteCarBill: mocks.deleteCarBill }));
vi.mock("@/lib/tracker/carReminder", () => ({
  createCarReminder: mocks.createCarReminder,
  deleteCarRemindersBySourceKey: mocks.deleteCarRemindersBySourceKey,
}));
vi.mock("@/lib/tracker/cosmosHelpers", () => ({ getTrackerDocById: mocks.getTrackerDocById }));

import { PATCH, DELETE } from "@/app/api/cars/car-bills/[id]/route";

function request(body?: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-bills/x", {
    method: body ? "PATCH" : "DELETE",
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  });
}

const ownId = "owner@example.com::carBill::abc123";
const validPayload = { billType: "insurance", cost: 420, date: "2025-06-01" };

describe("PATCH /api/cars/car-bills/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", currentMileage: 40000 });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.updateCarBill.mockResolvedValue({ id: ownId });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request("{}"), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling updateCarBill", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: "attacker@example.com::carBill::abc123" }) });
    expect(response.status).toBe(404);
    expect(mocks.updateCarBill).not.toHaveBeenCalled();
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
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.updateCarBill).not.toHaveBeenCalled();
  });

  it("returns not found when the update itself finds nothing to update", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarBill.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(404);
  });

  it("updates a valid car bill with no reminder requested", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.createCarReminder).not.toHaveBeenCalled();
  });

  it("clears any existing reminder for the bill type before creating a new one, keyed carBill:<billType>", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await PATCH(
      request(JSON.stringify({ ...validPayload, reminder: { intervalType: "months", intervalValue: 12 } })),
      { params: Promise.resolve({ id: ownId }) }
    );
    expect(mocks.deleteCarRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "car-1", "carBill:insurance");
    expect(mocks.createCarReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ sourceKey: "carBill:insurance" }));
  });
});

// Deliberately different from the bill-PATCH's read-only check above,
// and from services/fuel/mods' own DELETE routes: this one resolves the
// record's own car via getTrackerDocById + getCarById(existing.carId),
// not getPrimaryCar - a real, intentional deviation confirmed by
// reading the route's own source rather than assumed from the
// motorcycle bills-id-route pattern.
describe("DELETE /api/cars/car-bills/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getTrackerDocById.mockResolvedValue({ carId: "car-1" });
    mocks.getCarById.mockResolvedValue({ id: "car-1" });
    mocks.isCarReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling deleteCarBill", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: "attacker@example.com::carBill::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.deleteCarBill).not.toHaveBeenCalled();
  });

  it("checks read-only status against the record's own car, looked up via its stored carId", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);

    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });

    expect(mocks.getCarById).toHaveBeenCalledWith("owner@example.com", "car-1");
    expect(response.status).toBe(403);
    expect(mocks.deleteCarBill).not.toHaveBeenCalled();
  });

  it("deletes a valid, owned car bill", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.deleteCarBill).toHaveBeenCalledWith("owner@example.com", ownId);
  });
});
