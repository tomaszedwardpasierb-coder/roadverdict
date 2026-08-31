import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  getPendingScanBatch: vi.fn(),
  savePendingScanBatch: vi.fn(),
  deletePendingScanBatch: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({ getPrimaryBike: mocks.getPrimaryBike }));
vi.mock("@/lib/tracker/pendingScanBatch", () => ({
  getPendingScanBatch: mocks.getPendingScanBatch,
  savePendingScanBatch: mocks.savePendingScanBatch,
  deletePendingScanBatch: mocks.deletePendingScanBatch,
}));

import { GET, POST, DELETE } from "@/app/api/tracker/pending-scan-batch/route";

function postRequest(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/pending-scan-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const bike = { id: "bike-1" };
const items = [{ category: "fuel", cost: 20, date: "2025-01-01" }] as any;

describe("GET /api/tracker/pending-scan-batch", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryBike.mockResolvedValue(bike);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(404);
  });

  it("returns the pending batch, or null if there isn't one", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPendingScanBatch.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ batch: null });
  });

  it("returns the real batch document when one exists", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPendingScanBatch.mockResolvedValue({ id: "batch-1", items });
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ batch: { id: "batch-1", items } });
  });
});

describe("POST /api/tracker/pending-scan-batch", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryBike.mockResolvedValue(bike);
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
});

describe("DELETE /api/tracker/pending-scan-batch", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryBike.mockResolvedValue(bike);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE();
    expect(response.status).toBe(401);
    expect(mocks.deletePendingScanBatch).not.toHaveBeenCalled();
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await DELETE();
    expect(response.status).toBe(404);
  });

  it("discards the batch and returns ok", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deletePendingScanBatch).toHaveBeenCalledWith("owner@example.com", "bike-1");
  });
});