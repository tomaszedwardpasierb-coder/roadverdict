import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  updateCarFine: vi.fn(),
  deleteCarFine: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getPrimaryCar: mocks.getPrimaryCar,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carFine", () => ({ updateCarFine: mocks.updateCarFine, deleteCarFine: mocks.deleteCarFine }));

import { PATCH, DELETE } from "@/app/api/cars/car-fines/[id]/route";

function request(body?: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-fines/x", {
    method: body ? "PATCH" : "DELETE",
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  });
}

const ownId = "owner@example.com::carFine::abc123";
const validPayload = { fineType: "speeding", cost: 100, date: "2025-06-01" };

describe("PATCH /api/cars/car-fines/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1" });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.updateCarFine.mockResolvedValue({ id: ownId });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request("{}"), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling updateCarFine", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: "attacker@example.com::carFine::abc123" }) });
    expect(response.status).toBe(404);
    expect(mocks.updateCarFine).not.toHaveBeenCalled();
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
    const response = await PATCH(request(JSON.stringify({ fineType: "speeding" })), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(400);
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.updateCarFine).not.toHaveBeenCalled();
  });

  it("returns not found when the update itself finds nothing to update", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarFine.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(404);
  });

  it("updates a valid fine", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
  });
});

describe("DELETE /api/cars/car-fines/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1" });
    mocks.isCarReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling deleteCarFine", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: "attacker@example.com::carFine::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.deleteCarFine).not.toHaveBeenCalled();
  });

  it("blocks deletes on a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.deleteCarFine).not.toHaveBeenCalled();
  });

  it("deletes a valid, owned fine", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.deleteCarFine).toHaveBeenCalledWith("owner@example.com", ownId);
  });
});
