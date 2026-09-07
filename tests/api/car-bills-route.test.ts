import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  createCarBill: vi.fn(),
  createCarReminder: vi.fn(),
  deleteCarRemindersBySourceKey: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getPrimaryCar: mocks.getPrimaryCar,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carBill", () => ({ createCarBill: mocks.createCarBill }));
vi.mock("@/lib/tracker/carReminder", () => ({
  createCarReminder: mocks.createCarReminder,
  deleteCarRemindersBySourceKey: mocks.deleteCarRemindersBySourceKey,
}));
// productionYearCheck.ts and carBillTypes.ts deliberately NOT mocked -
// both pure, no I/O.

import { POST } from "@/app/api/cars/car-bills/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-bills", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validPayload = {
  billType: "insurance",
  cost: 420,
  date: "2025-06-01",
  notes: "Annual renewal",
};

describe("POST /api/cars/car-bills", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", year: 2018, currentMileage: 40000 });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.createCarBill.mockResolvedValue({ id: "bill-1" });
  });

  it("rejects unauthenticated requests before reading the body", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("not-json"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not signed in." });
  });

  it("rejects malformed JSON for an authenticated request", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
  });

  it("rejects incomplete payloads before accessing the vehicle repository", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ billType: "insurance" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please fill in all required fields." });
    expect(mocks.getPrimaryCar).not.toHaveBeenCalled();
  });

  it("returns not found when the account has no car yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No car found for this account." });
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This car has been transferred and is now read-only.",
    });
    expect(mocks.createCarBill).not.toHaveBeenCalled();
  });

  it("rejects a bill dated before the car's production year", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validPayload, date: "2015-01-01" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "This date is before 2018, when this car was made.",
    });
    expect(mocks.createCarBill).not.toHaveBeenCalled();
  });

  it("creates a valid car bill with no reminder requested", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bill: { id: "bill-1" } });
    expect(mocks.createCarBill).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      carId: "car-1", billType: "insurance", cost: 420,
    }));
    expect(mocks.createCarReminder).not.toHaveBeenCalled();
    expect(mocks.deleteCarRemindersBySourceKey).not.toHaveBeenCalled();
  });

  // Recognises a car-only bill type (no motorcycle equivalent) - proves
  // CAR_BILL_LABELS, not BILL_LABELS, is really what names the reminder.
  it("creates a reminder alongside the bill, keyed carBill:<billType>, clearing any existing one first", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({
      ...validPayload,
      billType: "congestion",
      reminder: { intervalType: "months", intervalValue: 12 },
    })));

    expect(response.status).toBe(200);
    expect(mocks.deleteCarRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "car-1", "carBill:congestion");
    expect(mocks.createCarReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      carId: "car-1",
      intervalType: "months",
      intervalValue: 12,
      baseMileage: 40000,
      sourceKey: "carBill:congestion",
    }));
  });
});
