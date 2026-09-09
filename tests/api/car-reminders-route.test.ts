import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  createCarReminder: vi.fn(),
  deleteCarRemindersBySourceKey: vi.fn(),
  logImpersonationActivityForCurrentRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getPrimaryCar: mocks.getPrimaryCar,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carReminder", () => ({
  createCarReminder: mocks.createCarReminder,
  deleteCarRemindersBySourceKey: mocks.deleteCarRemindersBySourceKey,
}));
vi.mock("@/lib/admin/impersonation", () => ({
  logImpersonationActivityForCurrentRequest: mocks.logImpersonationActivityForCurrentRequest,
}));

import { POST } from "@/app/api/cars/car-reminders/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-reminders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/cars/car-reminders", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", currentMileage: 40000 });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.createCarReminder.mockResolvedValue({ id: "reminder-1" });
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
    const response = await POST(request(JSON.stringify({ name: "Cambelt" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please fill in all required fields." });
    expect(mocks.getPrimaryCar).not.toHaveBeenCalled();
  });

  it("requires an interval value for a non-date interval type", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({
      name: "Cambelt", intervalType: "mileage", date: "2025-01-01",
    })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please enter an interval." });
    expect(mocks.getPrimaryCar).not.toHaveBeenCalled();
  });

  it("requires an exact date for a date-type interval", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({
      name: "Insurance renewal", intervalType: "date", date: "2025-01-01",
    })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please pick a date." });
    expect(mocks.getPrimaryCar).not.toHaveBeenCalled();
  });

  it("returns not found when the account has no car yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({
      name: "Cambelt", intervalType: "mileage", intervalValue: 60000, date: "2025-01-01",
    })));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No car found for this account." });
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify({
      name: "Cambelt", intervalType: "mileage", intervalValue: 60000, date: "2025-01-01",
    })));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This car has been transferred and is now read-only.",
    });
    expect(mocks.createCarReminder).not.toHaveBeenCalled();
  });

  it("creates a valid car reminder with no sourceKey, clearing nothing first", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({
      name: "Cambelt", intervalType: "mileage", intervalValue: 60000, date: "2025-01-01",
    })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reminder: { id: "reminder-1" } });
    expect(mocks.deleteCarRemindersBySourceKey).not.toHaveBeenCalled();
    expect(mocks.createCarReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      carId: "car-1", name: "Cambelt", intervalType: "mileage", intervalValue: 60000,
    }));
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("carReminder", "reminder-1", "create");
  });

  it("clears any existing reminder for the same sourceKey before creating the new one", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({
      name: "Insurance renewal",
      intervalType: "date",
      exactDate: "2026-06-01",
      date: "2025-06-01",
      sourceKey: "carBill:insurance",
    })));

    expect(response.status).toBe(200);
    expect(mocks.deleteCarRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "car-1", "carBill:insurance");
    expect(mocks.createCarReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      sourceKey: "carBill:insurance", exactDate: "2026-06-01",
    }));
  });
});
