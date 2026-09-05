import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveShareToken: vi.fn(),
  hasReportAccess: vi.fn(),
  getSellerReportData: vi.fn(),
  createReceiptRequest: vi.fn(),
  sendReceiptRequestEmail: vi.fn(),
}));

vi.mock("@/lib/tracker/shareLink", () => ({ resolveShareToken: mocks.resolveShareToken }));
vi.mock("@/lib/tracker/reportAccess", () => ({ hasReportAccess: mocks.hasReportAccess }));
vi.mock("@/lib/tracker/sellerReportData", () => ({ getSellerReportData: mocks.getSellerReportData }));
vi.mock("@/lib/tracker/receiptRequest", () => ({ createReceiptRequest: mocks.createReceiptRequest }));
vi.mock("@/lib/resend", () => ({ sendReceiptRequestEmail: mocks.sendReceiptRequestEmail }));

import { POST } from "@/app/api/report/[token]/request-receipts/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/report/tok-a/request-receipts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

// rows/entryRequestStatus below simulate the data belonging ONLY to the
// bike behind tok-a - getSellerReportData is itself the token-scoping
// boundary, so an entryId that isn't among these rows (e.g. one that
// belongs to a different owner's bike/report) must be silently dropped,
// never looked up or requested.
const reportData = {
  bike: { make: "Yamaha", model: "MT-07" },
  rows: [
    { id: "sr-1", date: "2025-01-01", category: "Service", description: "Full service", attachment: { blobName: "a.jpg" } },
    { id: "mod-1", date: "2025-02-01", category: "Modification", description: "Exhaust", attachment: { blobName: "b.jpg" } },
    { id: "no-attachment-1", date: "2025-03-01", category: "Bill", description: "Insurance", attachment: null },
  ],
  entryRequestStatus: {} as Record<string, { status: string }>,
};

describe("POST /api/report/[token]/request-receipts", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.hasReportAccess.mockResolvedValue(true);
    mocks.resolveShareToken.mockResolvedValue({
      email: "owner@example.com",
      bikeId: "bike-1",
      recipientEmail: "buyer@example.com",
    });
    mocks.getSellerReportData.mockResolvedValue({ ...reportData, entryRequestStatus: {} });
    mocks.createReceiptRequest.mockResolvedValue({ decisionToken: "dec-tok-1" });
    mocks.sendReceiptRequestEmail.mockResolvedValue(undefined);
  });

  it("rejects when the plate gate hasn't been passed, without resolving the token at all", async () => {
    mocks.hasReportAccess.mockResolvedValue(false);

    const response = await POST(request(JSON.stringify({ entryIds: ["sr-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Please verify the registration first." });
    expect(mocks.resolveShareToken).not.toHaveBeenCalled();
  });

  it("returns 404 for an invalid or expired share token", async () => {
    mocks.resolveShareToken.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({ entryIds: ["sr-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "This link is no longer valid." });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"), { params: Promise.resolve({ token: "tok-a" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("rejects a missing or empty entryIds array", async () => {
    const response = await POST(request(JSON.stringify({ entryIds: [] })), { params: Promise.resolve({ token: "tok-a" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please select at least one entry." });
  });

  it("rejects entryIds that don't belong to any row on this token's own report (cross-report/guessed ids)", async () => {
    const response = await POST(
      request(JSON.stringify({ entryIds: ["some-other-report-entry-id"] })),
      { params: Promise.resolve({ token: "tok-a" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "None of the selected entries have a receipt attached, or they're already pending a decision.",
    });
    expect(mocks.createReceiptRequest).not.toHaveBeenCalled();
  });

  it("rejects entries that have no attachment", async () => {
    const response = await POST(request(JSON.stringify({ entryIds: ["no-attachment-1"] })), { params: Promise.resolve({ token: "tok-a" }) });
    expect(response.status).toBe(400);
    expect(mocks.createReceiptRequest).not.toHaveBeenCalled();
  });

  it("rejects entries that already have a pending request against them", async () => {
    mocks.getSellerReportData.mockResolvedValue({
      ...reportData,
      entryRequestStatus: { "sr-1": { status: "pending" } },
    });

    const response = await POST(request(JSON.stringify({ entryIds: ["sr-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(400);
    expect(mocks.createReceiptRequest).not.toHaveBeenCalled();
  });

  it("creates a request scoped to this token's own owner email, bike id and share token", async () => {
    await POST(request(JSON.stringify({ entryIds: ["sr-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(mocks.createReceiptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerEmail: "owner@example.com",
        shareToken: "tok-a",
        bikeId: "bike-1",
        buyerEmail: "buyer@example.com",
      })
    );
  });

  it("maps categories from the report row labels to the internal category enum", async () => {
    await POST(request(JSON.stringify({ entryIds: ["sr-1", "mod-1"] })), { params: Promise.resolve({ token: "tok-a" }) });

    const items = mocks.createReceiptRequest.mock.calls[0][0].items;
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

    expect(mocks.createReceiptRequest.mock.calls[0][0].buyerMessage).toHaveLength(500);
  });

  it("leaves buyerMessage undefined when it isn't a string", async () => {
    await POST(request(JSON.stringify({ entryIds: ["sr-1"], buyerMessage: 12345 })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(mocks.createReceiptRequest.mock.calls[0][0].buyerMessage).toBeUndefined();
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
