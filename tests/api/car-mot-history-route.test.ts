// Place at: tests/api/car-mot-history-route.test.ts
//
// Mirrors tests/api/mot-history-route.test.ts exactly - same behaviour,
// car-shaped functions and endpoint.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCarById: vi.fn(),
  getCurrentRegistration: vi.fn(),
  importMotHistoryForCar: vi.fn(),
  logImpersonationActivityForCurrentRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getCarById: mocks.getCarById,
  getCurrentRegistration: mocks.getCurrentRegistration,
}));
vi.mock("@/lib/tracker/carMotHistoryImport", () => ({
  importMotHistoryForCar: mocks.importMotHistoryForCar,
}));
vi.mock("@/lib/admin/impersonation", () => ({
  logImpersonationActivityForCurrentRequest: mocks.logImpersonationActivityForCurrentRequest,
}));

import { POST } from "@/app/api/cars/car/mot-history/route";

function request(body: object): NextRequest {
  return new NextRequest("http://localhost/api/cars/car/mot-history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function badRequest(): NextRequest {
  return new NextRequest("http://localhost/api/cars/car/mot-history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not-json",
  });
}

const email = "driver@example.com";
const car = { id: "car-1", make: "Ford" } as any;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email });
  mocks.getCarById.mockResolvedValue(car);
  mocks.getCurrentRegistration.mockReturnValue("AB12CDE");
  mocks.importMotHistoryForCar.mockResolvedValue({ imported: 3, skipped: 0 });
});

describe("POST /api/cars/car/mot-history", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request({ carId: "car-1" }));
    expect(response.status).toBe(401);
    expect(mocks.importMotHistoryForCar).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(badRequest());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("returns 400 when carId is missing from the body", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "carId is required." });
    expect(mocks.getCarById).not.toHaveBeenCalled();
  });

  it("returns 404 when no car exists for that id under the signed-in account", async () => {
    mocks.getCarById.mockResolvedValue(null);
    const response = await POST(request({ carId: "car-1" }));
    expect(response.status).toBe(404);
    expect(mocks.importMotHistoryForCar).not.toHaveBeenCalled();
  });

  it("returns 400 when the car has no registration on record", async () => {
    mocks.getCurrentRegistration.mockReturnValue(null);
    const response = await POST(request({ carId: "car-1" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("no registration") });
    expect(mocks.importMotHistoryForCar).not.toHaveBeenCalled();
  });

  it("calls importMotHistoryForCar with the session email, car, and current registration", async () => {
    await POST(request({ carId: "car-1" }));
    expect(mocks.importMotHistoryForCar).toHaveBeenCalledWith(email, car, "AB12CDE");
  });

  it("returns the import result on success", async () => {
    const response = await POST(request({ carId: "car-1" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ imported: 3, skipped: 0 });
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("car", "car-1", "update");
  });

  it("forwards the error and status code when importMotHistoryForCar returns an error object", async () => {
    mocks.importMotHistoryForCar.mockResolvedValue({
      error: "No MOT history found for this registration.",
      status: 404,
    });
    const response = await POST(request({ carId: "car-1" }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "No MOT history found for this registration.",
    });
  });

  it("looks up the car using the session email, not a client-supplied one", async () => {
    await POST(request({ carId: "car-1" }));
    expect(mocks.getCarById).toHaveBeenCalledWith(email, "car-1");
  });
});
