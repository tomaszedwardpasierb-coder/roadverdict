import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBikesForUser: vi.fn(),
  deleteBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getBikesForUser: mocks.getBikesForUser,
  deleteBike: mocks.deleteBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));

import { DELETE } from "@/app/api/tracker/bike/[bikeId]/route";

function request(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bike/x", { method: "DELETE" });
}

const ownBikeId = "owner@example.com::bike::1000::abc123";

describe("DELETE /api/tracker/bike/[bikeId]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getBikesForUser.mockResolvedValue([{ id: ownBikeId, transferredTo: undefined }]);
    mocks.isBikeReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(request(), { params: { bikeId: ownBikeId } });
    expect(response.status).toBe(401);
    expect(mocks.deleteBike).not.toHaveBeenCalled();
  });

  it("returns 404 when the bikeId doesn't belong to this account", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getBikesForUser.mockResolvedValue([{ id: "some-other-bike", transferredTo: undefined }]);

    const response = await DELETE(request(), { params: { bikeId: ownBikeId } });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Bike not found on this account." });
    expect(mocks.deleteBike).not.toHaveBeenCalled();
  });

  it("decodes a URL-encoded bikeId before matching it against the account's own bikes", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const encoded = encodeURIComponent(ownBikeId);

    const response = await DELETE(request(), { params: { bikeId: encoded } });

    expect(response.status).toBe(200);
    expect(mocks.deleteBike).toHaveBeenCalledWith("owner@example.com", ownBikeId);
  });

  it("blocks deletion of a transferred (read-only) bike", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);

    const response = await DELETE(request(), { params: { bikeId: ownBikeId } });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This bike has been transferred and is now read-only.",
    });
    expect(mocks.deleteBike).not.toHaveBeenCalled();
  });

  it("deletes the bike and returns ok when it belongs to the account and isn't read-only", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await DELETE(request(), { params: { bikeId: ownBikeId } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deleteBike).toHaveBeenCalledWith("owner@example.com", ownBikeId);
  });
});
