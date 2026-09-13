import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkAndRecordWrite: vi.fn(),
  getPrimaryCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  createCarFine: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/writeRateLimit", () => ({ checkAndRecordWrite: mocks.checkAndRecordWrite }));
vi.mock("@/lib/tracker/car", () => ({
  getPrimaryCar: mocks.getPrimaryCar,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carFine", () => ({ createCarFine: mocks.createCarFine }));

import { POST } from "@/app/api/cars/car-fines/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-fines", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validPayload = { fineType: "speeding", cost: 100, date: "2025-06-01", notes: "" };

describe("POST /api/cars/car-fines", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.checkAndRecordWrite.mockResolvedValue(true);
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", year: 2018, currentMileage: 5000 });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.createCarFine.mockResolvedValue({ id: "fine-1" });
  });

  it("returns 429 when the account is over its write-rate budget, before ever reading the body", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkAndRecordWrite.mockResolvedValue(false);
    const response = await POST(request("{}"));
    expect(response.status).toBe(429);
    expect(mocks.createCarFine).not.toHaveBeenCalled();
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
    const response = await POST(request(JSON.stringify({ fineType: "speeding" })));
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
    expect(mocks.createCarFine).not.toHaveBeenCalled();
  });

  it("rejects a fine dated before the car's production year", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validPayload, date: "2015-01-01" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "This date is before 2018, when this car was made." });
    expect(mocks.createCarFine).not.toHaveBeenCalled();
  });

  it("creates a valid fine", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ fine: { id: "fine-1" } });
    expect(mocks.createCarFine).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ carId: "car-1", fineType: "speeding", cost: 100 }));
  });
});
