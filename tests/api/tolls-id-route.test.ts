import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  updateToll: vi.fn(),
  deleteToll: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/toll", () => ({ updateToll: mocks.updateToll, deleteToll: mocks.deleteToll }));

import { PATCH, DELETE } from "@/app/api/tracker/tolls/[id]/route";

function request(body?: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/tolls/x", {
    method: body ? "PATCH" : "DELETE",
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  });
}

const ownId = "owner@example.com::toll::abc123";
const validPayload = { tollType: "dartford-crossing", cost: 2.5, date: "2025-06-01" };

describe("PATCH /api/tracker/tolls/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1" });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.updateToll.mockResolvedValue({ id: ownId });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request("{}"), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling updateToll", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: "attacker@example.com::toll::abc123" }) });
    expect(response.status).toBe(404);
    expect(mocks.updateToll).not.toHaveBeenCalled();
  });

  it("decodes a URL-encoded id before checking its ownership prefix", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: encodeURIComponent(ownId) }) });
    expect(response.status).toBe(200);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request("not-json"), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(400);
  });

  it("rejects an incomplete payload", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify({ tollType: "dartford-crossing" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(400);
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.updateToll).not.toHaveBeenCalled();
  });

  it("returns not found when the update itself finds nothing to update", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateToll.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(404);
  });

  it("updates a valid toll", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
  });
});

describe("DELETE /api/tracker/tolls/[id]", () => {
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

  it("refuses an id prefixed with a different owner's email, without ever calling deleteToll", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: "attacker@example.com::toll::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.deleteToll).not.toHaveBeenCalled();
  });

  it("blocks deletes on a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.deleteToll).not.toHaveBeenCalled();
  });

  it("deletes a valid, owned toll", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.deleteToll).toHaveBeenCalledWith("owner@example.com", ownId);
  });
});
