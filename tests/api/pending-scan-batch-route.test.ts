import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  getPrimaryCar: vi.fn(),
  getPendingScanBatch: vi.fn(),
  savePendingScanBatch: vi.fn(),
  deletePendingScanBatch: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({ getPrimaryBike: mocks.getPrimaryBike }));
vi.mock("@/lib/tracker/car", () => ({ getPrimaryCar: mocks.getPrimaryCar }));
vi.mock("@/lib/tracker/pendingScanBatch", () => ({
  getPendingScanBatch: mocks.getPendingScanBatch,
  savePendingScanBatch: mocks.savePendingScanBatch,
  deletePendingScanBatch: mocks.deletePendingScanBatch,
}));

import { GET, POST, DELETE } from "@/app/api/tracker/pending-scan-batch/route";

function getRequest(vehicleKind?: string): NextRequest {
  const suffix = vehicleKind ? `?vehicleKind=${vehicleKind}` : "";
  return new NextRequest(`http://localhost/api/tracker/pending-scan-batch${suffix}`);
}

function deleteRequest(vehicleKind?: string): NextRequest {
  const suffix = vehicleKind ? `?vehicleKind=${vehicleKind}` : "";
  return new NextRequest(`http://localhost/api/tracker/pending-scan-batch${suffix}`, { method: "DELETE" });
}

function postRequest(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/pending-scan-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const bike = { id: "bike-1" };
const car = { id: "car-1" };
const items = [{ category: "fuel", cost: 20, date: "2025-01-01" }] as any;

describe("GET /api/tracker/pending-scan-batch", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryBike.mockResolvedValue(bike);
    mocks.getPrimaryCar.mockResolvedValue(car);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await GET(getRequest());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No bike found for this account." });
  });

  it("returns the pending batch, or null if there isn't one", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPendingScanBatch.mockResolvedValue(null);
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ batch: null });
  });

  it("returns the real batch document when one exists", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPendingScanBatch.mockResolvedValue({ id: "batch-1", items });
    const response = await GET(getRequest());
    await expect(response.json()).resolves.toEqual({ batch: { id: "batch-1", items } });
  });

  it("resolves the car's batch, not the bike's, when vehicleKind=car", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPendingScanBatch.mockResolvedValue(null);
    await GET(getRequest("car"));
    expect(mocks.getPrimaryCar).toHaveBeenCalledWith("owner@example.com");
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
    expect(mocks.getPendingScanBatch).toHaveBeenCalledWith("owner@example.com", "car-1");
  });

  it("returns 404 with the car-specific message when the account has no car yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue(null);
    const response = await GET(getRequest("car"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No car found for this account." });
  });
});

describe("POST /api/tracker/pending-scan-batch", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryBike.mockResolvedValue(bike);
    mocks.getPrimaryCar.mockResolvedValue(car);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(postRequest(JSON.stringify({ items })));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await POST(postRequest(JSON.stringify({ items })));
    expect(response.status).toBe(404);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(postRequest("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a body where items isn't an array", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(postRequest(JSON.stringify({ items: "nope" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing items." });
  });

  // Explicit guarantee from the source comment: an empty list means the
  // batch is done, so it deletes rather than storing a pointless
  // empty document.
  it("deletes the batch (rather than saving an empty one) when items is an empty array", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(postRequest(JSON.stringify({ items: [] })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deletePendingScanBatch).toHaveBeenCalledWith("owner@example.com", "bike-1");
    expect(mocks.savePendingScanBatch).not.toHaveBeenCalled();
  });

  it("saves the batch and returns it when items has content", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.savePendingScanBatch.mockResolvedValue({ id: "batch-1", items });
    const response = await POST(postRequest(JSON.stringify({ items })));
    expect(response.status).toBe(200);
    expect(mocks.savePendingScanBatch).toHaveBeenCalledWith("owner@example.com", "bike-1", items);
    await expect(response.json()).resolves.toEqual({ batch: { id: "batch-1", items } });
  });

  it("saves against the car's own id, not the bike's, when vehicleKind is 'car'", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.savePendingScanBatch.mockResolvedValue({ id: "batch-1", items });
    await POST(postRequest(JSON.stringify({ items, vehicleKind: "car" })));
    expect(mocks.savePendingScanBatch).toHaveBeenCalledWith("owner@example.com", "car-1", items);
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
  });

  it("returns 404 with the car-specific message when the account has no car yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue(null);
    const response = await POST(postRequest(JSON.stringify({ items, vehicleKind: "car" })));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No car found for this account." });
  });
});

describe("DELETE /api/tracker/pending-scan-batch", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryBike.mockResolvedValue(bike);
    mocks.getPrimaryCar.mockResolvedValue(car);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(deleteRequest());
    expect(response.status).toBe(401);
    expect(mocks.deletePendingScanBatch).not.toHaveBeenCalled();
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await DELETE(deleteRequest());
    expect(response.status).toBe(404);
  });

  it("discards the batch and returns ok", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(deleteRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deletePendingScanBatch).toHaveBeenCalledWith("owner@example.com", "bike-1");
  });

  it("discards the car's batch, not the bike's, when vehicleKind=car", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await DELETE(deleteRequest("car"));
    expect(mocks.deletePendingScanBatch).toHaveBeenCalledWith("owner@example.com", "car-1");
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
  });
});
