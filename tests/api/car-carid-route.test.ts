import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCarsForUser: vi.fn(),
  deleteCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  logImpersonationActivityForCurrentRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getCarsForUser: mocks.getCarsForUser,
  deleteCar: mocks.deleteCar,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/admin/impersonation", () => ({
  logImpersonationActivityForCurrentRequest: mocks.logImpersonationActivityForCurrentRequest,
}));

import { DELETE } from "@/app/api/cars/car/[carId]/route";

function request(): NextRequest {
  return new NextRequest("http://localhost/api/cars/car/x", { method: "DELETE" });
}

const ownCarId = "owner@example.com::car::1000::abc123";

describe("DELETE /api/cars/car/[carId]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getCarsForUser.mockResolvedValue([{ id: ownCarId, transferredTo: undefined }]);
    mocks.isCarReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(request(), { params: Promise.resolve({ carId: ownCarId }) });
    expect(response.status).toBe(401);
    expect(mocks.deleteCar).not.toHaveBeenCalled();
  });

  it("returns 404 when the carId doesn't belong to this account", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getCarsForUser.mockResolvedValue([{ id: "some-other-car", transferredTo: undefined }]);

    const response = await DELETE(request(), { params: Promise.resolve({ carId: ownCarId }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Car not found on this account." });
    expect(mocks.deleteCar).not.toHaveBeenCalled();
  });

  it("decodes a URL-encoded carId before matching it against the account's own cars", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const encoded = encodeURIComponent(ownCarId);

    const response = await DELETE(request(), { params: Promise.resolve({ carId: encoded }) });

    expect(response.status).toBe(200);
    expect(mocks.deleteCar).toHaveBeenCalledWith("owner@example.com", ownCarId);
  });

  it("blocks deletion of a transferred (read-only) car", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);

    const response = await DELETE(request(), { params: Promise.resolve({ carId: ownCarId }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This car has been transferred and is now read-only.",
    });
    expect(mocks.deleteCar).not.toHaveBeenCalled();
  });

  it("deletes the car and returns ok when it belongs to the account and isn't read-only", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await DELETE(request(), { params: Promise.resolve({ carId: ownCarId }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deleteCar).toHaveBeenCalledWith("owner@example.com", ownCarId);
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("car", ownCarId, "delete");
  });
});
