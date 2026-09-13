import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  createToll: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/toll", () => ({ createToll: mocks.createToll }));

import { POST } from "@/app/api/tracker/tolls/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/tolls", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validPayload = { tollType: "dartford-crossing", cost: 2.5, date: "2025-06-01", notes: "" };

describe("POST /api/tracker/tolls", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", year: 2018, currentMileage: 5000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.createToll.mockResolvedValue({ id: "toll-1" });
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
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
  });

  it("returns not found when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(404);
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(403);
    expect(mocks.createToll).not.toHaveBeenCalled();
  });

  it("rejects a toll dated before the bike's production year", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validPayload, date: "2015-01-01" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "This date is before 2018, when this bike was made." });
    expect(mocks.createToll).not.toHaveBeenCalled();
  });

  it("creates a valid toll", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ toll: { id: "toll-1" } });
    expect(mocks.createToll).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ bikeId: "bike-1", tollType: "dartford-crossing", cost: 2.5 }));
  });
});
