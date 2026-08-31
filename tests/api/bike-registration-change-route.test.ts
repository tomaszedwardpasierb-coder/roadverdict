import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBikesForUser: vi.fn(),
  addRegistrationChange: vi.fn(),
  isBikeReadOnly: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getBikesForUser: mocks.getBikesForUser,
  addRegistrationChange: mocks.addRegistrationChange,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));

import { POST } from "@/app/api/tracker/bike/registration-change/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bike/registration-change", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const bikeId = "bike-1";
const validPayload = { bikeId, plate: "xy99 zzz", reason: "private-plate-assigned" };

describe("POST /api/tracker/bike/registration-change", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getBikesForUser.mockResolvedValue([{ id: bikeId, transferredTo: undefined }]);
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.addRegistrationChange.mockResolvedValue({ id: bikeId, registrationChanges: [{ plate: "XY99 ZZZ", reason: "private-plate-assigned" }] });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("{}"));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("requires a bikeId", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ plate: "AB12CDE", reason: "correction" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No bike specified." });
  });

  it("rejects an empty or whitespace-only plate", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validPayload, plate: "   " })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "New registration number is required." });
  });

  it("rejects a missing reason", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ bikeId, plate: "XY99 ZZZ" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please select a reason for the change." });
  });

  it("rejects a reason outside the known set", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validPayload, reason: "made-up-reason" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please select a reason for the change." });
  });

  it.each(["private-plate-assigned", "private-plate-removed", "correction", "other"])(
    "accepts %s as a valid reason",
    async (reason) => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
      const response = await POST(request(JSON.stringify({ ...validPayload, reason })));
      expect(response.status).toBe(200);
    }
  );

  it("returns 404 when the bikeId doesn't belong to this account", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getBikesForUser.mockResolvedValue([{ id: "some-other-bike", transferredTo: undefined }]);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Bike not found on this account." });
    expect(mocks.addRegistrationChange).not.toHaveBeenCalled();
  });

  it("blocks a registration change on a transferred (read-only) bike", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(403);
    expect(mocks.addRegistrationChange).not.toHaveBeenCalled();
  });

  it("trims and uppercases the plate before recording the change", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request(JSON.stringify({ ...validPayload, plate: "  xy99 zzz  " })));
    expect(mocks.addRegistrationChange).toHaveBeenCalledWith("owner@example.com", bikeId, "XY99 ZZZ", "private-plate-assigned");
  });

  it("returns 404 if the update itself can't find the bike (e.g. deleted mid-request)", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.addRegistrationChange.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Bike not found." });
  });

  it("returns the updated bike on success", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      bike: { id: bikeId, registrationChanges: [{ plate: "XY99 ZZZ", reason: "private-plate-assigned" }] },
    });
  });
});