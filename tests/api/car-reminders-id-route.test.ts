import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  updateCarReminder: vi.fn(),
  deleteCarReminder: vi.fn(),
  logImpersonationActivityForCurrentRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getPrimaryCar: mocks.getPrimaryCar,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carReminder", () => ({ updateCarReminder: mocks.updateCarReminder, deleteCarReminder: mocks.deleteCarReminder }));
vi.mock("@/lib/admin/impersonation", () => ({
  logImpersonationActivityForCurrentRequest: mocks.logImpersonationActivityForCurrentRequest,
}));

import { PATCH, DELETE } from "@/app/api/cars/car-reminders/[id]/route";

function request(): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-reminders/x", { method: "PATCH" });
}

const ownId = "owner@example.com::carReminder::abc123";

describe("PATCH /api/cars/car-reminders/[id] (mark done)", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", currentMileage: 40000 });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.updateCarReminder.mockResolvedValue({ id: ownId });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling updateCarReminder", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(), { params: Promise.resolve({ id: "attacker@example.com::carReminder::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.updateCarReminder).not.toHaveBeenCalled();
  });

  it("blocks marking a reminder done on a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await PATCH(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.updateCarReminder).not.toHaveBeenCalled();
  });

  it("resets the reminder's base point to the car's current mileage and today's date", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const todayIso = new Date().toISOString().slice(0, 10);

    await PATCH(request(), { params: Promise.resolve({ id: ownId }) });

    expect(mocks.updateCarReminder).toHaveBeenCalledWith("owner@example.com", ownId, {
      baseMileage: 40000,
      date: todayIso,
    });
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("carReminder", ownId, "update");
  });

  it("returns not found when the reminder itself doesn't exist", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarReminder.mockResolvedValue(null);
    const response = await PATCH(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/cars/car-reminders/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1" });
    mocks.isCarReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: "attacker@example.com::carReminder::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.deleteCarReminder).not.toHaveBeenCalled();
  });

  it("blocks deleting a reminder on a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
  });

  it("deletes a valid, owned car reminder", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.deleteCarReminder).toHaveBeenCalledWith("owner@example.com", ownId);
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("carReminder", ownId, "delete");
  });
});
