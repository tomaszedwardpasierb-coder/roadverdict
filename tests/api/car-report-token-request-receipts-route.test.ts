// Mirrors report-token-request-receipts-route.test.ts for the car equivalent route.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveCarShareToken: vi.fn(),
  hasReportAccess: vi.fn(),
  getCarSellerReportData: vi.fn(),
  createCarReceiptRequest: vi.fn(),
  sendReceiptRequestEmail: vi.fn(),
}));

vi.mock("@/lib/tracker/carShareLink", () => ({ resolveCarShareToken: mocks.resolveCarShareToken }));
vi.mock("@/lib/tracker/reportAccess", () => ({ hasReportAccess: mocks.hasReportAccess }));
vi.mock("@/lib/tracker/carSellerReportData", () => ({ getCarSellerReportData: mocks.getCarSellerReportData }));
vi.mock("@/lib/tracker/carReceiptRequest", () => ({ createCarReceiptRequest: mocks.createCarReceiptRequest }));
vi.mock("@/lib/resend", () => ({ sendReceiptRequestEmail: mocks.sendReceiptRequestEmail }));

import { POST } from "@/app/api/car-report/[token]/request-receipts/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/car-report/tok-a/request-receipts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const reportData = {
  car: { make: "Ford", model: "Focus" },
  rows: [
    { id: "sr-1", date: "2025-01-01", category: "Service", description: "Full service", attachment: { blobName: "a.jpg" } },
    { id: "mod-1", date: "2025-02-01", category: "Modification", description: "Exhaust", attachment: { blobName: "b.jpg" } },
    { id: "no-attachment-1", date: "2025-03-01", category: "Bill", description: "Insurance", attachment: null },
  ],
  entryRequestStatus: {} as Record<string, { status: string }>,
};

describe("POST /api/car-report/[token]/request-receipts", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.hasReportAccess.mockResolvedValue(true);
    mocks.resolveCarShareToken.mockResolvedValue({
      email: "owner@example.com",
      carId: "car-1",
      recipientEmail: "buyer@example.com",
    });
    mocks.getCarSellerReportData.mockResolvedValue({ ...reportData, entryRequestStatus: {} });
    mocks.createCarReceiptRequest.mockResolvedValue({ decisionToken: "dec-tok-1" });
    mocks.sendReceiptRequestEmail.mockResolvedValue(undefined);
  });

  it("rejects when the plate gate hasn't been passed, without resolving the token at all", async () => {
    mocks.hasReportAccess.mockResolvedValue(false);

    const response = await POST(request(JSON.stringify({ entryIds: ["sr-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(403);
    expect(mocks.resolveCarShareToken).not.toHaveBeenCalled();
  });

  it("returns 404 for an invalid or expired share token", async () => {
    mocks.resolveCarShareToken.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({ entryIds: ["sr-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(404);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"), { params: Promise.resolve({ token: "tok-a" }) });
    expect(response.status).toBe(400);
  });

  it("rejects a missing or empty entryIds array", async () => {
    const response = await POST(request(JSON.stringify({ entryIds: [] })), { params: Promise.resolve({ token: "tok-a" }) });
    expect(response.status).toBe(400);
  });

  it("rejects entryIds that don't belong to any row on this token's own report", async () => {
    const response = await POST(
      request(JSON.stringify({ entryIds: ["some-other-report-entry-id"] })),
      { params: Promise.resolve({ token: "tok-a" }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.createCarReceiptRequest).not.toHaveBeenCalled();
  });

  it("rejects entries that have no attachment", async () => {
    const response = await POST(request(JSON.stringify({ entryIds: ["no-attachment-1"] })), { params: Promise.resolve({ token: "tok-a" }) });
    expect(response.status).toBe(400);
    expect(mocks.createCarReceiptRequest).not.toHaveBeenCalled();
  });

  it("rejects entries that already have a pending request against them", async () => {
    mocks.getCarSellerReportData.mockResolvedValue({
      ...reportData,
      entryRequestStatus: { "sr-1": { status: "pending" } },
    });

    const response = await POST(request(JSON.stringify({ entryIds: ["sr-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(400);
    expect(mocks.createCarReceiptRequest).not.toHaveBeenCalled();
  });

  it("creates a request scoped to this token's own owner email, car id and share token", async () => {
    await POST(request(JSON.stringify({ entryIds: ["sr-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(mocks.createCarReceiptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerEmail: "owner@example.com",
        shareToken: "tok-a",
        carId: "car-1",
        buyerEmail: "buyer@example.com",
      })
    );
  });

  it("maps categories from the report row labels to the internal category enum", async () => {
    await POST(request(JSON.stringify({ entryIds: ["sr-1", "mod-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    const items = mocks.createCarReceiptRequest.mock.calls[0][0].items;
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: "sr-1", category: "service" }),
        expect.objectContaining({ entryId: "mod-1", category: "mods" }),
      ])
    );
  });

  it("truncates an overly long buyer message to 500 characters", async () => {
    const longMessage = "x".repeat(600);

    await POST(request(JSON.stringify({ entryIds: ["sr-1"], buyerMessage: longMessage })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(mocks.createCarReceiptRequest.mock.calls[0][0].buyerMessage).toHaveLength(500);
  });

  it("still succeeds and returns the count even when the notification email fails to send", async () => {
    mocks.sendReceiptRequestEmail.mockRejectedValue(new Error("Resend is down"));

    const response = await POST(request(JSON.stringify({ entryIds: ["sr-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, requested: 1 });
  });

  it("returns the number of entries actually requested", async () => {
    const response = await POST(request(JSON.stringify({ entryIds: ["sr-1", "mod-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    await expect(response.json()).resolves.toEqual({ ok: true, requested: 2 });
  });
});
