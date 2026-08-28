import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  createBill: vi.fn(),
  createReminder: vi.fn(),
  deleteRemindersBySourceKey: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/bill", () => ({ createBill: mocks.createBill }));
vi.mock("@/lib/tracker/reminder", () => ({
  createReminder: mocks.createReminder,
  deleteRemindersBySourceKey: mocks.deleteRemindersBySourceKey,
}));
// productionYearCheck.ts and billTypes.ts are deliberately NOT mocked -
// both are pure, no I/O (a date comparison and a static labels lookup),
// so the tests exercise the real logic rather than a stand-in for it.

import { POST } from "@/app/api/tracker/bills/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bills", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validPayload = {
  billType: "insurance",
  cost: 320,
  date: "2025-06-01",
  notes: "Annual renewal",
};

describe("POST /api/tracker/bills", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", year: 2018, currentMileage: 5000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.createBill.mockResolvedValue({ id: "bill-1" });
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
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
  });

  it("returns not found when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No bike found for this account." });
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This bike has been transferred and is now read-only.",
    });
    expect(mocks.createBill).not.toHaveBeenCalled();
  });

  // Bill-specific: no equivalent check exists on mods. Real isBeforeProduction
  // logic runs here, not a mock - this is testing the route wires it up
  // correctly, not re-testing the date-comparison logic itself.
  it("rejects a bill dated before the bike's production year", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", year: 2018, currentMileage: 5000 });

    const response = await POST(request(JSON.stringify({ ...validPayload, date: "2015-01-01" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "This date is before 2018, when this bike was made.",
    });
    expect(mocks.createBill).not.toHaveBeenCalled();
  });

  it("creates a valid bill with no reminder requested", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bill: { id: "bill-1" } });
    expect(mocks.createBill).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      bikeId: "bike-1",
      billType: "insurance",
      cost: 320,
    }));
    expect(mocks.createReminder).not.toHaveBeenCalled();
    expect(mocks.deleteRemindersBySourceKey).not.toHaveBeenCalled();
  });

  // Bill-specific: the optional reminder side-effect has no equivalent on
  // mods either. Confirms both the create call and that any existing
  // reminder for this exact bill type is cleared first, not left to
  // duplicate alongside the new one.
  it("creates a reminder alongside the bill when one is requested, clearing any existing one for the same bill type first", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({
      ...validPayload,
      reminder: { intervalType: "months", intervalValue: 12 },
    })));

    expect(response.status).toBe(200);
    expect(mocks.deleteRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "bike-1", "bill:insurance");
    expect(mocks.createReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      bikeId: "bike-1",
      name: "Insurance renewal",
      intervalType: "months",
      intervalValue: 12,
      baseMileage: 5000,
      sourceKey: "bill:insurance",
    }));
  });
});