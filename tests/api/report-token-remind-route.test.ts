import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveShareToken: vi.fn(),
  hasReportAccess: vi.fn(),
  getSellerReportData: vi.fn(),
  getReceiptRequestsForShareToken: vi.fn(),
  canSendReminder: vi.fn(),
  recordReminderSent: vi.fn(),
  regenerateDecisionToken: vi.fn(),
  sendReceiptRequestEmail: vi.fn(),
}));

vi.mock("@/lib/tracker/shareLink", () => ({ resolveShareToken: mocks.resolveShareToken }));
vi.mock("@/lib/tracker/reportAccess", () => ({ hasReportAccess: mocks.hasReportAccess }));
vi.mock("@/lib/tracker/sellerReportData", () => ({ getSellerReportData: mocks.getSellerReportData }));
vi.mock("@/lib/tracker/receiptRequest", () => ({
  getReceiptRequestsForShareToken: mocks.getReceiptRequestsForShareToken,
  canSendReminder: mocks.canSendReminder,
  recordReminderSent: mocks.recordReminderSent,
  regenerateDecisionToken: mocks.regenerateDecisionToken,
}));
vi.mock("@/lib/resend", () => ({ sendReceiptRequestEmail: mocks.sendReceiptRequestEmail }));

import { POST } from "@/app/api/report/[token]/remind/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/report/tok-a/remind", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const pendingRequest = {
  id: "req-1",
  buyerMessage: "Can you share the receipt?",
  items: [
    { entryId: "e1", status: "pending" as const },
    { entryId: "e2", status: "approved" as const },
  ],
};

describe("POST /api/report/[token]/remind", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.hasReportAccess.mockResolvedValue(true);
    mocks.resolveShareToken.mockResolvedValue({ email: "owner@example.com", bikeId: "bike-1" });
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([pendingRequest]);
    mocks.canSendReminder.mockReturnValue(true);
    mocks.regenerateDecisionToken.mockResolvedValue("fresh-decision-token");
    mocks.getSellerReportData.mockResolvedValue({ bike: { make: "Yamaha", model: "MT-07" } });
    mocks.sendReceiptRequestEmail.mockResolvedValue(undefined);
    mocks.recordReminderSent.mockResolvedValue(undefined);
  });

  it("rejects when the plate gate hasn't been passed for this token, without touching any receipt-request data", async () => {
    mocks.hasReportAccess.mockResolvedValue(false);

    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: { token: "tok-a" } });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Please verify the registration first." });
    expect(mocks.resolveShareToken).not.toHaveBeenCalled();
    expect(mocks.getReceiptRequestsForShareToken).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"), { params: { token: "tok-a" } });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("rejects a missing entryId", async () => {
    const response = await POST(request(JSON.stringify({})), { params: { token: "tok-a" } });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("returns 404 for an invalid or expired share token", async () => {
    mocks.resolveShareToken.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: { token: "tok-a" } });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "This link is no longer valid." });
  });

  it("looks up receipt requests scoped to this token's own owner email and this token only", async () => {
    await POST(request(JSON.stringify({ entryId: "e1" })), { params: { token: "tok-a" } });

    expect(mocks.getReceiptRequestsForShareToken).toHaveBeenCalledWith("owner@example.com", "tok-a");
  });

  it("returns 404 when the entryId doesn't match any pending item on this token's requests (e.g. it belongs to a different report)", async () => {
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([pendingRequest]);

    const response = await POST(request(JSON.stringify({ entryId: "belongs-to-other-report" })), {
      params: { token: "tok-a" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "This request is no longer pending." });
    expect(mocks.regenerateDecisionToken).not.toHaveBeenCalled();
  });

  it("returns 404 when the matching entry is no longer pending (already approved/declined)", async () => {
    const response = await POST(request(JSON.stringify({ entryId: "e2" })), { params: { token: "tok-a" } });
    expect(response.status).toBe(404);
  });

  it("returns 429 when a reminder was already sent recently", async () => {
    mocks.canSendReminder.mockReturnValue(false);

    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: { token: "tok-a" } });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "A reminder was already sent recently. Please check back later.",
    });
    expect(mocks.regenerateDecisionToken).not.toHaveBeenCalled();
  });

  it("returns 500 without sending email when a fresh decision token cannot be generated", async () => {
    mocks.regenerateDecisionToken.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: { token: "tok-a" } });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Could not send a reminder right now." });
    expect(mocks.sendReceiptRequestEmail).not.toHaveBeenCalled();
  });

  it("sends a reminder email and records it as sent on success", async () => {
    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: { token: "tok-a" } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.sendReceiptRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerEmail: "owner@example.com",
        bikeName: "Yamaha MT-07",
        decisionToken: "fresh-decision-token",
        isReminder: true,
      })
    );
    expect(mocks.recordReminderSent).toHaveBeenCalledWith("req-1", "owner@example.com");
  });

  it("still records the reminder as sent even if the email itself fails to send", async () => {
    mocks.sendReceiptRequestEmail.mockRejectedValue(new Error("Resend is down"));

    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: { token: "tok-a" } });

    expect(response.status).toBe(200);
    expect(mocks.recordReminderSent).toHaveBeenCalledWith("req-1", "owner@example.com");
  });

  it("only includes still-pending items in the reminder email, not already-decided ones", async () => {
    await POST(request(JSON.stringify({ entryId: "e1" })), { params: { token: "tok-a" } });

    const callArg = mocks.sendReceiptRequestEmail.mock.calls[0][0];
    expect(callArg.items).toEqual([{ entryId: "e1", status: "pending" }]);
  });
});
