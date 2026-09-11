// Place at: tests/api/car-registration-change-route.test.ts
// Car mirror of bike-registration-change-route.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCarsForUser: vi.fn(),
  addCarRegistrationChange: vi.fn(),
  isCarReadOnly: vi.fn(),
  logImpersonationActivityForCurrentRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getCarsForUser: mocks.getCarsForUser,
  addCarRegistrationChange: mocks.addCarRegistrationChange,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/admin/impersonation", () => ({
  logImpersonationActivityForCurrentRequest: mocks.logImpersonationActivityForCurrentRequest,
}));

import { POST } from "@/app/api/cars/car/registration-change/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car/registration-change", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const carId = "car-1";
const validPayload = { carId, plate: "xy99 zzz", reason: "private-plate-assigned" };

describe("POST /api/cars/car/registration-change", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getCarsForUser.mockResolvedValue([{ id: carId, transferredTo: undefined }]);
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.addCarRegistrationChange.mockResolvedValue({ id: carId, registrationChanges: [{ plate: "XY99 ZZZ", reason: "private-plate-assigned" }] });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("{}"));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("requires a carId", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ plate: "AB12CDE", reason: "correction" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No car specified." });
  });

  it("rejects an empty or whitespace-only plate", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validPayload, plate: "   " })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "New registration number is required." });
  });

  it("rejects a missing reason", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ carId, plate: "XY99 ZZZ" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please select a reason for the change." });
  });

  it("rejects a reason outside the known set", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validPayload, reason: "made-up-reason" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please select a reason for the change." });
  });

  it.each(["private-plate-assigned", "private-plate-removed", "correction", "other"])(
    "accepts %s as a valid reason",
    async (reason) => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
      const response = await POST(request(JSON.stringify({ ...validPayload, reason })));
      expect(response.status).toBe(200);
    }
  );

  it("returns 404 when the carId doesn't belong to this account", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getCarsForUser.mockResolvedValue([{ id: "some-other-car", transferredTo: undefined }]);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Car not found on this account." });
    expect(mocks.addCarRegistrationChange).not.toHaveBeenCalled();
  });

  it("blocks a registration change on a transferred (read-only) car", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(403);
    expect(mocks.addCarRegistrationChange).not.toHaveBeenCalled();
  });

  it("trims and uppercases the plate before recording the change", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request(JSON.stringify({ ...validPayload, plate: "  xy99 zzz  " })));
    expect(mocks.addCarRegistrationChange).toHaveBeenCalledWith("owner@example.com", carId, "XY99 ZZZ", "private-plate-assigned");
  });

  it("returns 404 if the update itself can't find the car (e.g. deleted mid-request)", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.addCarRegistrationChange.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Car not found." });
  });

  it("returns the updated car on success", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      car: { id: carId, registrationChanges: [{ plate: "XY99 ZZZ", reason: "private-plate-assigned" }] },
    });
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("car", carId, "update");
  });
});
