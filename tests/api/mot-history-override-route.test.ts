import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  getBike: vi.fn(),
  importMotHistoryForBike: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/bike", () => ({ getBike: mocks.getBike }));
// importMotHistoryForBike does the real work (VDG lookup, bill import,
// reminder setting) and is exercised elsewhere - mocked here so this
// stays focused on the route's own auth-gating and input handling.
vi.mock("@/lib/tracker/motHistoryImport", () => ({ importMotHistoryForBike: mocks.importMotHistoryForBike }));

import { POST } from "@/app/api/tomasz/mot-history-override/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/mot-history-override", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validBody = { email: "rider@example.com", bikeId: "bike-1", vrm: "ab12cde" };
const bike = { id: "bike-1", make: "Yamaha" };

describe("POST /api/tomasz/mot-history-override", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getBike.mockResolvedValue(bike);
    mocks.importMotHistoryForBike.mockResolvedValue({ createdCount: 1, skippedCount: 0, skipped: [], motDueDate: "2026-05-01", reminderSet: true });
  });

  it("rejects a non-admin request outright, without ever looking up the bike", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(401);
    expect(mocks.getBike).not.toHaveBeenCalled();
    expect(mocks.importMotHistoryForBike).not.toHaveBeenCalled();
  });

  it("rejects a request with no admin session cookie at all", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not signed in as admin." });
  });

  it("rejects malformed JSON", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a request missing any of email, bikeId or vrm", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ email: "rider@example.com", bikeId: "bike-1" })));
    expect(response.status).toBe(400);
    expect(mocks.getBike).not.toHaveBeenCalled();
  });

  it("returns 404 when the bike doesn't exist on that account", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.getBike.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(404);
    expect(mocks.importMotHistoryForBike).not.toHaveBeenCalled();
  });

  it("looks the bike up by the exact email and bikeId given, not any session-derived identity", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(request(JSON.stringify(validBody)));
    expect(mocks.getBike).toHaveBeenCalledWith("rider@example.com", "bike-1");
  });

  it("normalises the vrm to uppercase, trimmed, before importing", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(request(JSON.stringify({ ...validBody, vrm: "  ab12 cde  " })));
    expect(mocks.importMotHistoryForBike).toHaveBeenCalledWith("rider@example.com", bike, "AB12 CDE");
  });

  it("surfaces an error result from the import (e.g. no MOT history found) with its given status", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.importMotHistoryForBike.mockResolvedValue({ error: "No MOT history found - this vehicle may be MOT-exempt (under 3 years old) or not yet tested.", status: 404 });
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(404);
  });

  it("returns the import result on success", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const result = { createdCount: 2, skippedCount: 1, skipped: [{ date: "2024-01-01", reason: "already logged" }], motDueDate: "2026-05-01", reminderSet: true };
    mocks.importMotHistoryForBike.mockResolvedValue(result);
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
  });
});
