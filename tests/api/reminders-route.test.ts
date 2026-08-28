import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  createReminder: vi.fn(),
  deleteRemindersBySourceKey: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/reminder", () => ({
  createReminder: mocks.createReminder,
  deleteRemindersBySourceKey: mocks.deleteRemindersBySourceKey,
}));

import { POST } from "@/app/api/tracker/reminders/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/reminders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tracker/reminders", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", currentMileage: 5000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.createReminder.mockResolvedValue({ id: "reminder-1" });
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

    const response = await POST(request(JSON.stringify({ name: "Chain lube" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please fill in all required fields." });
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
  });

  // Two distinct conditional-validation branches, each with its own
  // message - worth their own cases rather than assuming one covers both.
  it("requires an interval value for a non-date interval type", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({
      name: "Chain lube", intervalType: "months", date: "2025-01-01",
    })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please enter an interval." });
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
  });

  it("requires an exact date for a date-type interval", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({
      name: "Insurance renewal", intervalType: "date", date: "2025-01-01",
    })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please pick a date." });
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
  });

  it("returns not found when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({
      name: "Chain lube", intervalType: "mileage", intervalValue: 500, date: "2025-01-01",
    })));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No bike found for this account." });
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);

    const response = await POST(request(JSON.stringify({
      name: "Chain lube", intervalType: "mileage", intervalValue: 500, date: "2025-01-01",
    })));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This bike has been transferred and is now read-only.",
    });
    expect(mocks.createReminder).not.toHaveBeenCalled();
  });

  it("creates a valid reminder with no sourceKey, clearing nothing first", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({
      name: "Chain lube", intervalType: "mileage", intervalValue: 500, date: "2025-01-01",
    })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reminder: { id: "reminder-1" } });
    expect(mocks.deleteRemindersBySourceKey).not.toHaveBeenCalled();
    expect(mocks.createReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      bikeId: "bike-1",
      name: "Chain lube",
      intervalType: "mileage",
      intervalValue: 500,
    }));
  });

  it("clears any existing reminder for the same sourceKey before creating the new one", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({
      name: "Insurance renewal",
      intervalType: "date",
      exactDate: "2026-06-01",
      date: "2025-06-01",
      sourceKey: "bill:insurance",
    })));

    expect(response.status).toBe(200);
    expect(mocks.deleteRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "bike-1", "bill:insurance");
    expect(mocks.createReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      sourceKey: "bill:insurance",
      exactDate: "2026-06-01",
    }));
  });
});