import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBike: vi.fn(),
  getCurrentRegistration: vi.fn(),
  updateBikeDvlaData: vi.fn(),
  isBikeReadOnly: vi.fn(),
  fetchDvlaDataFromVdg: vi.fn(),
  importMotHistoryForBike: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getBike: mocks.getBike,
  getCurrentRegistration: mocks.getCurrentRegistration,
  updateBikeDvlaData: mocks.updateBikeDvlaData,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/dvlaDataFetch", () => ({ fetchDvlaDataFromVdg: mocks.fetchDvlaDataFromVdg }));
vi.mock("@/lib/tracker/motHistoryImport", () => ({ importMotHistoryForBike: mocks.importMotHistoryForBike }));

import { POST } from "@/app/api/tracker/bike/refresh-data/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bike/refresh-data", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const bike = { id: "bike-1", originalRegistration: "AB12 CDE" };

describe("POST /api/tracker/bike/refresh-data", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getBike.mockResolvedValue(bike);
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.getCurrentRegistration.mockReturnValue("AB12 CDE");
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(null);
    mocks.importMotHistoryForBike.mockResolvedValue({ createdCount: 0, skippedCount: 0, skipped: [], motDueDate: null, reminderSet: false });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("{}"));
    expect(response.status).toBe(401);
    expect(mocks.getBike).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("requires a bikeId", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "bikeId is required." });
  });

  it("returns 404 when the bike isn't found for this account", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getBike.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ bikeId: "bike-1" })));
    expect(response.status).toBe(404);
  });

  it("blocks refreshing a transferred (read-only) bike", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify({ bikeId: "bike-1" })));
    expect(response.status).toBe(403);
    expect(mocks.fetchDvlaDataFromVdg).not.toHaveBeenCalled();
  });

  it("refuses a bike with no registration on record", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getCurrentRegistration.mockReturnValue(undefined);
    const response = await POST(request(JSON.stringify({ bikeId: "bike-1" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "This bike has no registration on record, so it can't be looked up.",
    });
  });

  it("reports dvlaRefreshed true and saves the data when the DVLA lookup succeeds", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const dvlaData = { fetchedAt: "2025-01-01T00:00:00.000Z", keeperChangeList: [], plateChangeList: [], v5cIssueDates: [] };
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(dvlaData);

    const response = await POST(request(JSON.stringify({ bikeId: "bike-1" })));

    expect(response.status).toBe(200);
    expect(mocks.updateBikeDvlaData).toHaveBeenCalledWith("owner@example.com", "bike-1", dvlaData);
    await expect(response.json()).resolves.toMatchObject({ ok: true, dvlaRefreshed: true });
  });

  it("reports dvlaRefreshed false without saving anything when the lookup finds nothing", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchDvlaDataFromVdg.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ bikeId: "bike-1" })));
    expect(mocks.updateBikeDvlaData).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ dvlaRefreshed: false });
  });

  // Explicit non-blocking guarantee in the source: a failed DVLA refresh
  // must not fail the whole request or skip the MOT import that follows.
  it("still returns 200 and still attempts the MOT import when the DVLA refresh throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetchDvlaDataFromVdg.mockRejectedValue(new Error("DVLA API unavailable"));

    const response = await POST(request(JSON.stringify({ bikeId: "bike-1" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, dvlaRefreshed: false });
    expect(mocks.importMotHistoryForBike).toHaveBeenCalledWith("owner@example.com", bike, "AB12 CDE");
  });

  it("reports the created/skipped counts from a successful MOT import", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.importMotHistoryForBike.mockResolvedValue({
      createdCount: 3,
      skippedCount: 1,
      skipped: [{ date: "2024-01-01", reason: "Already logged." }],
      motDueDate: "2026-01-01",
      reminderSet: true,
    });

    const response = await POST(request(JSON.stringify({ bikeId: "bike-1" })));

    await expect(response.json()).resolves.toMatchObject({ motCreated: 3, motSkipped: 1 });
  });

  // The route checks `"error" in result` rather than a thrown exception -
  // a well-formed error result (e.g. vehicle MOT-exempt) must not be
  // mistaken for real created/skipped counts.
  it("leaves motCreated/motSkipped at 0 when the MOT import itself reports an error result", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.importMotHistoryForBike.mockResolvedValue({ error: "No MOT history found.", status: 404 });

    const response = await POST(request(JSON.stringify({ bikeId: "bike-1" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, motCreated: 0, motSkipped: 0 });
  });

  it("still returns 200 with motCreated/motSkipped at 0 when the MOT import throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.importMotHistoryForBike.mockRejectedValue(new Error("MOT API unavailable"));

    const response = await POST(request(JSON.stringify({ bikeId: "bike-1" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, motCreated: 0, motSkipped: 0 });
  });
});