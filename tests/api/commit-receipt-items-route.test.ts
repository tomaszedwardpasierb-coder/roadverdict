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

import { POST } from "@/app/api/tracker/commit-receipt-items/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/commit-receipt-items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const bike = { id: "bike-1" };
const car = { id: "car-1" };
const itemLater = { category: "fuel", cost: 20, date: "2025-01-05" } as any;
const itemEarlier = { category: "service", cost: 50, date: "2025-01-01" } as any;

describe("POST /api/tracker/commit-receipt-items", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryBike.mockResolvedValue(bike);
    mocks.getPrimaryCar.mockResolvedValue(car);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ items: [itemLater] })));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ items: [itemLater] })));
    expect(response.status).toBe(404);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("returns an empty, zeroed-out result when items is missing or not an array, without calling commitReceiptItem", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ createdEntries: [], createdCount: 0, categories: [], failedItems: [], failedCount: 0 });
    expect(mocks.commitReceiptItem).not.toHaveBeenCalled();
  });

  it("returns the same empty result for an empty items array", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ items: [] })));
    await expect(response.json()).resolves.toEqual({ createdEntries: [], createdCount: 0, categories: [], failedItems: [], failedCount: 0 });
  });

  // Explicit guarantee from the source comment: never trust client
  // ordering, always re-sort into true chronological order first.
  it("commits items in chronological order regardless of the order the client sent them in", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.commitReceiptItem.mockImplementation(async (_email, _bike, item) => ({ id: `entry-${item.date}`, category: item.category }));

    await POST(request(JSON.stringify({ items: [itemLater, itemEarlier] })));

    expect(mocks.commitReceiptItem).toHaveBeenNthCalledWith(1, "owner@example.com", bike, itemEarlier);
    expect(mocks.commitReceiptItem).toHaveBeenNthCalledWith(2, "owner@example.com", bike, itemLater);
  });

  it("reports every created entry, its count, and its distinct categories when everything succeeds", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.commitReceiptItem
      .mockResolvedValueOnce({ id: "entry-1", category: "service" })
      .mockResolvedValueOnce({ id: "entry-2", category: "fuel" });

    const response = await POST(request(JSON.stringify({ items: [itemEarlier, itemLater] })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      createdEntries: [{ id: "entry-1", category: "service" }, { id: "entry-2", category: "fuel" }],
      createdCount: 2,
      categories: ["service", "fuel"],
      failedItems: [],
      failedCount: 0,
    });
  });

  // Explicit guarantee: one bad item must not cost the rest of a
  // genuinely fine batch their chance to be saved.
  it("continues past a single failed item and still commits the rest of the batch", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.commitReceiptItem
      .mockResolvedValueOnce({ id: "entry-1", category: "service" })
      .mockRejectedValueOnce(new Error("bad OCR read"));

    const response = await POST(request(JSON.stringify({ items: [itemEarlier, itemLater] })));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.createdEntries).toEqual([{ id: "entry-1", category: "service" }]);
    expect(body.createdCount).toBe(1);
    expect(body.failedItems).toEqual([itemLater]);
    expect(body.failedCount).toBe(1);
    expect(body.error).toBe("1 of 2 saved successfully; 1 couldn't be saved.");
    expect(body.detail).toBe("bad OCR read");
  });

  it("omits the error/detail fields entirely when nothing failed", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.commitReceiptItem.mockResolvedValue({ id: "entry-1", category: "fuel" });
    const response = await POST(request(JSON.stringify({ items: [itemLater] })));
    const body = await response.json();
    expect(body.error).toBeUndefined();
    expect(body.detail).toBeUndefined();
  });

  // vehicleKind isn't sent by the current (motorcycle-only) client yet -
  // every test above omits it and must keep hitting the bike path
  // unchanged. These cover the car branch once vehicleKind: "car" is sent.
  describe("vehicleKind: car", () => {
    it("returns 404 with a car-specific message when the account has no car yet, without ever looking up a bike", async () => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
      mocks.getPrimaryCar.mockResolvedValue(null);
      const response = await POST(request(JSON.stringify({ items: [itemLater], vehicleKind: "car" })));
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "No car found for this account." });
      expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
    });

    it("routes every item to commitCarReceiptItem (not commitReceiptItem), still in chronological order", async () => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
      mocks.commitCarReceiptItem.mockImplementation(async (_email, _car, item) => ({ id: `entry-${item.date}`, category: item.category }));

      await POST(request(JSON.stringify({ items: [itemLater, itemEarlier], vehicleKind: "car" })));

      expect(mocks.commitCarReceiptItem).toHaveBeenNthCalledWith(1, "owner@example.com", car, itemEarlier);
      expect(mocks.commitCarReceiptItem).toHaveBeenNthCalledWith(2, "owner@example.com", car, itemLater);
      expect(mocks.commitReceiptItem).not.toHaveBeenCalled();
    });

    it("still continues past a single failed item on the car path", async () => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
      mocks.commitCarReceiptItem
        .mockResolvedValueOnce({ id: "entry-1", category: "service" })
        .mockRejectedValueOnce(new Error("bad OCR read"));

      const response = await POST(request(JSON.stringify({ items: [itemEarlier, itemLater], vehicleKind: "car" })));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.createdEntries).toEqual([{ id: "entry-1", category: "service" }]);
      expect(body.failedItems).toEqual([itemLater]);
    });
  });
});