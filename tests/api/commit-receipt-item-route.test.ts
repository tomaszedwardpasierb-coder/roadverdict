import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  getPrimaryCar: vi.fn(),
  commitReceiptItem: vi.fn(),
  commitCarReceiptItem: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({ getPrimaryBike: mocks.getPrimaryBike }));
vi.mock("@/lib/tracker/car", () => ({ getPrimaryCar: mocks.getPrimaryCar }));
vi.mock("@/lib/tracker/commitReceiptItem", () => ({ commitReceiptItem: mocks.commitReceiptItem }));
vi.mock("@/lib/tracker/commitCarReceiptItem", () => ({ commitCarReceiptItem: mocks.commitCarReceiptItem }));

import { POST } from "@/app/api/tracker/commit-receipt-item/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/commit-receipt-item", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const bike = { id: "bike-1" };
const car = { id: "car-1" };
const item = { category: "fuel", cost: 20, date: "2025-01-01" } as any;

describe("POST /api/tracker/commit-receipt-item", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryBike.mockResolvedValue(bike);
    mocks.getPrimaryCar.mockResolvedValue(car);
    mocks.commitReceiptItem.mockResolvedValue({ id: "entry-1", category: "fuel" });
    mocks.commitCarReceiptItem.mockResolvedValue({ id: "entry-1", category: "fuel" });
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

  // vehicleKind isn't sent by the current (motorcycle-only) review queue
  // yet - every test above omits it and must keep hitting the bike path
  // unchanged. These cover the car branch once vehicleKind: "car" is sent.
  describe("vehicleKind: car", () => {
    it("returns 404 with a car-specific message when the account has no car yet, without ever looking up a bike", async () => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
      mocks.getPrimaryCar.mockResolvedValue(null);
      const response = await POST(request(JSON.stringify({ item, vehicleKind: "car" })));
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "No car found for this account." });
      expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
      expect(mocks.commitCarReceiptItem).not.toHaveBeenCalled();
    });

    it("routes to commitCarReceiptItem (not commitReceiptItem) with the signed-in email's car", async () => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
      await POST(request(JSON.stringify({ item, vehicleKind: "car" })));
      expect(mocks.commitCarReceiptItem).toHaveBeenCalledWith("owner@example.com", car, item, [], []);
      expect(mocks.commitReceiptItem).not.toHaveBeenCalled();
    });

    it("passes through explicit batchHints and boundsOnlyHints on the car path too", async () => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
      const batchHints = [{ date: "2025-01-01", mileage: 40000 }];
      const boundsOnlyHints = [{ date: "2025-01-02", mileage: 40010, batchIndex: 1 }];
      await POST(request(JSON.stringify({ item, vehicleKind: "car", batchHints, boundsOnlyHints })));
      expect(mocks.commitCarReceiptItem).toHaveBeenCalledWith("owner@example.com", car, item, batchHints, boundsOnlyHints);
    });

    it("returns the created entry on success via the car path", async () => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
      const response = await POST(request(JSON.stringify({ item, vehicleKind: "car" })));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ entry: { id: "entry-1", category: "fuel" } });
    });
  });
});