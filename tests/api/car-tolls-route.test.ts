import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  createCarToll: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getPrimaryCar: mocks.getPrimaryCar,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carToll", () => ({ createCarToll: mocks.createCarToll }));

import { POST } from "@/app/api/cars/car-tolls/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-tolls", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validPayload = { tollType: "dartford-crossing", cost: 2.5, date: "2025-06-01", notes: "" };

describe("POST /api/cars/car-tolls", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", year: 2018, currentMileage: 5000 });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.createCarToll.mockResolvedValue({ id: "toll-1" });
  });

  it("rejects unauthenticated requests before reading the body", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("not-json"));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON for an authenticated request", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects incomplete payloads before accessing the vehicle repository", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ tollType: "dartford-crossing" })));
    expect(response.status).toBe(400);
    expect(mocks.getPrimaryCar).not.toHaveBeenCalled();
  });

  it("returns not found when the account has no car yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(404);
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(403);
    expect(mocks.createCarToll).not.toHaveBeenCalled();
  });

  it("rejects a toll dated before the car's production year", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validPayload, date: "2015-01-01" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "This date is before 2018, when this car was made." });
    expect(mocks.createCarToll).not.toHaveBeenCalled();
  });

  it("creates a valid toll", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ toll: { id: "toll-1" } });
    expect(mocks.createCarToll).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ carId: "car-1", tollType: "dartford-crossing", cost: 2.5 }));
  });
});
