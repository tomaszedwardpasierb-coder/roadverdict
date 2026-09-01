import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBike: vi.fn(),
  getCurrentRegistration: vi.fn(),
  importMotHistoryForBike: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getBike: mocks.getBike,
  getCurrentRegistration: mocks.getCurrentRegistration,
}));
vi.mock("@/lib/tracker/motHistoryImport", () => ({
  importMotHistoryForBike: mocks.importMotHistoryForBike,
}));

import { POST } from "@/app/api/tracker/mot-history/route";

function request(body: object): NextRequest {
  return new NextRequest("http://localhost/api/tracker/mot-history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function badRequest(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/mot-history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not-json",
  });
}

const email = "rider@example.com";
const bike = { id: "bike-1", make: "Yamaha" } as any;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email });
  mocks.getBike.mockResolvedValue(bike);
  mocks.getCurrentRegistration.mockReturnValue("AB12CDE");
  mocks.importMotHistoryForBike.mockResolvedValue({ imported: 3, skipped: 0 });
});

describe("POST /api/tracker/mot-history", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request({ bikeId: "bike-1" }));
    expect(response.status).toBe(401);
    expect(mocks.importMotHistoryForBike).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(badRequest());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("returns 400 when bikeId is missing from the body", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "bikeId is required." });
    expect(mocks.getBike).not.toHaveBeenCalled();
  });

  it("returns 404 when no bike exists for that id under the signed-in account", async () => {
    mocks.getBike.mockResolvedValue(null);
    const response = await POST(request({ bikeId: "bike-1" }));
    expect(response.status).toBe(404);
    expect(mocks.importMotHistoryForBike).not.toHaveBeenCalled();
  });

  it("returns 400 when the bike has no registration on record", async () => {
    mocks.getCurrentRegistration.mockReturnValue(null);
    const response = await POST(request({ bikeId: "bike-1" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("no registration") });
    expect(mocks.importMotHistoryForBike).not.toHaveBeenCalled();
  });

  it("calls importMotHistoryForBike with the session email, bike, and current registration", async () => {
    await POST(request({ bikeId: "bike-1" }));
    expect(mocks.importMotHistoryForBike).toHaveBeenCalledWith(email, bike, "AB12CDE");
  });

  it("returns the import result on success", async () => {
    const response = await POST(request({ bikeId: "bike-1" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ imported: 3, skipped: 0 });
  });

  // importMotHistoryForBike returns { error, status } rather than throwing
  // when it encounters a known failure (e.g. VDG returned nothing useful).
  it("forwards the error and status code when importMotHistoryForBike returns an error object", async () => {
    mocks.importMotHistoryForBike.mockResolvedValue({
      error: "No MOT history found for this registration.",
      status: 404,
    });
    const response = await POST(request({ bikeId: "bike-1" }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "No MOT history found for this registration.",
    });
  });

  it("looks up the bike using the session email, not a client-supplied one", async () => {
    await POST(request({ bikeId: "bike-1" }));
    expect(mocks.getBike).toHaveBeenCalledWith(email, "bike-1");
  });
});
