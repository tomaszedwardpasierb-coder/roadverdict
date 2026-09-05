import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/reminder", () => ({ updateReminder: mocks.updateReminder, deleteReminder: mocks.deleteReminder }));

import { PATCH, DELETE } from "@/app/api/tracker/reminders/[id]/route";

function request(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/reminders/x", { method: "PATCH" });
}

const ownId = "owner@example.com::reminder::abc123";

describe("PATCH /api/tracker/reminders/[id] (mark done)", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", currentMileage: 8000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.updateReminder.mockResolvedValue({ id: ownId });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling updateReminder", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(), { params: Promise.resolve({ id: "attacker@example.com::reminder::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.updateReminder).not.toHaveBeenCalled();
  });

  it("blocks marking a reminder done on a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await PATCH(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.updateReminder).not.toHaveBeenCalled();
  });

  // No body is read or validated at all here - marking done resets the
  // base point to the bike's current mileage and today's date, nothing
  // the caller sends is consulted.
  it("resets the reminder's base point to the bike's current mileage and today's date", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const todayIso = new Date().toISOString().slice(0, 10);

    await PATCH(request(), { params: Promise.resolve({ id: ownId }) });

    expect(mocks.updateReminder).toHaveBeenCalledWith("owner@example.com", ownId, {
      baseMileage: 8000,
      date: todayIso,
    });
  });

  it("returns not found when the reminder itself doesn't exist", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateReminder.mockResolvedValue(null);
    const response = await PATCH(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/tracker/reminders/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1" });
    mocks.isBikeReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: "attacker@example.com::reminder::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.deleteReminder).not.toHaveBeenCalled();
  });

  it("blocks deleting a reminder on a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
  });

  it("deletes a valid, owned reminder", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.deleteReminder).toHaveBeenCalledWith("owner@example.com", ownId);
  });
});