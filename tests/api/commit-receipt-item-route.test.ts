import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  commitReceiptItem: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({ getPrimaryBike: mocks.getPrimaryBike }));
vi.mock("@/lib/tracker/commitReceiptItem", () => ({ commitReceiptItem: mocks.commitReceiptItem }));

import { POST } from "@/app/api/tracker/commit-receipt-item/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/commit-receipt-item", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const bike = { id: "bike-1" };
const item = { category: "fuel", cost: 20, date: "2025-01-01" } as any;

describe("POST /api/tracker/commit-receipt-item", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryBike.mockResolvedValue(bike);
    mocks.commitReceiptItem.mockResolvedValue({ id: "entry-1", category: "fuel" });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ item })));
    expect(response.status).toBe(401);
    expect(mocks.commitReceiptItem).not.toHaveBeenCalled();
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ item })));
    expect(response.status).toBe(404);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a request with no item to commit", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Nothing to commit." });
    expect(mocks.commitReceiptItem).not.toHaveBeenCalled();
  });

  it("defaults batchHints and boundsOnlyHints to empty arrays when the client omits them", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request(JSON.stringify({ item })));
    expect(mocks.commitReceiptItem).toHaveBeenCalledWith("owner@example.com", bike, item, [], []);
  });

  it("passes through explicit batchHints and boundsOnlyHints when supplied", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const batchHints = [{ date: "2025-01-01", mileage: 5000 }];
    const boundsOnlyHints = [{ date: "2025-01-02", mileage: 5010, batchIndex: 1 }];
    await POST(request(JSON.stringify({ item, batchHints, boundsOnlyHints })));
    expect(mocks.commitReceiptItem).toHaveBeenCalledWith("owner@example.com", bike, item, batchHints, boundsOnlyHints);
  });

  it("returns the created entry on success", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ item })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entry: { id: "entry-1", category: "fuel" } });
  });

  it("responds 500 with the error detail when commitReceiptItem throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.commitReceiptItem.mockRejectedValue(new Error("Cosmos write conflict"));
    const response = await POST(request(JSON.stringify({ item })));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Something went wrong saving this entry. Please try again.",
      detail: "Cosmos write conflict",
    });
  });
});