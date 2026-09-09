// Mirrors report-token-remind-route.test.ts for the car equivalent route.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveCarShareToken: vi.fn(),
  hasReportAccess: vi.fn(),
  getCarSellerReportData: vi.fn(),
  getCarReceiptRequestsForShareToken: vi.fn(),
  canSendCarReminder: vi.fn(),
  recordCarReminderSent: vi.fn(),
  regenerateCarDecisionToken: vi.fn(),
  sendReceiptRequestEmail: vi.fn(),
}));

vi.mock("@/lib/tracker/carShareLink", () => ({ resolveCarShareToken: mocks.resolveCarShareToken }));
vi.mock("@/lib/tracker/reportAccess", () => ({ hasReportAccess: mocks.hasReportAccess }));
vi.mock("@/lib/tracker/carSellerReportData", () => ({ getCarSellerReportData: mocks.getCarSellerReportData }));
vi.mock("@/lib/tracker/carReceiptRequest", () => ({
  getCarReceiptRequestsForShareToken: mocks.getCarReceiptRequestsForShareToken,
  canSendCarReminder: mocks.canSendCarReminder,
  recordCarReminderSent: mocks.recordCarReminderSent,
  regenerateCarDecisionToken: mocks.regenerateCarDecisionToken,
}));
vi.mock("@/lib/resend", () => ({ sendReceiptRequestEmail: mocks.sendReceiptRequestEmail }));

import { POST } from "@/app/api/car-report/[token]/remind/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/car-report/tok-a/remind", {
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

describe("POST /api/car-report/[token]/remind", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.hasReportAccess.mockResolvedValue(true);
    mocks.resolveCarShareToken.mockResolvedValue({ email: "owner@example.com", carId: "car-1" });
    mocks.getCarReceiptRequestsForShareToken.mockResolvedValue([pendingRequest]);
    mocks.canSendCarReminder.mockReturnValue(true);
    mocks.regenerateCarDecisionToken.mockResolvedValue("fresh-decision-token");
    mocks.getCarSellerReportData.mockResolvedValue({ car: { make: "Ford", model: "Focus" } });
    mocks.sendReceiptRequestEmail.mockResolvedValue(undefined);
    mocks.recordCarReminderSent.mockResolvedValue(undefined);
  });

  it("rejects when the plate gate hasn't been passed for this token, without touching any receipt-request data", async () => {
    mocks.hasReportAccess.mockResolvedValue(false);

    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Please verify the registration first." });
    expect(mocks.resolveCarShareToken).not.toHaveBeenCalled();
    expect(mocks.getCarReceiptRequestsForShareToken).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"), { params: Promise.resolve({ token: "tok-a" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("rejects a missing entryId", async () => {
    const response = await POST(request(JSON.stringify({})), { params: Promise.resolve({ token: "tok-a" }) });
    expect(response.status).toBe(400);
  });

  it("returns 404 for an invalid or expired share token", async () => {
    mocks.resolveCarShareToken.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "This link is no longer valid." });
  });

  it("looks up receipt requests scoped to this token's own owner email and this token only", async () => {
    await POST(request(JSON.stringify({ entryId: "e1" })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(mocks.getCarReceiptRequestsForShareToken).toHaveBeenCalledWith("owner@example.com", "tok-a");
  });

  it("returns 404 when the entryId doesn't match any pending item on this token's requests", async () => {
    const response = await POST(request(JSON.stringify({ entryId: "belongs-to-other-report" })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "This request is no longer pending." });
    expect(mocks.regenerateCarDecisionToken).not.toHaveBeenCalled();
  });

  it("returns 404 when the matching entry is no longer pending (already approved/declined)", async () => {
    const response = await POST(request(JSON.stringify({ entryId: "e2" })), { params: Promise.resolve({ token: "tok-a" }) });
    expect(response.status).toBe(404);
  });

  it("returns 429 when a reminder was already sent recently", async () => {
    mocks.canSendCarReminder.mockReturnValue(false);

    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(429);
    expect(mocks.regenerateCarDecisionToken).not.toHaveBeenCalled();
  });

  it("returns 500 without sending email when a fresh decision token cannot be generated", async () => {
    mocks.regenerateCarDecisionToken.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(500);
    expect(mocks.sendReceiptRequestEmail).not.toHaveBeenCalled();
  });

  it("sends a reminder email and records it as sent on success", async () => {
    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.sendReceiptRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerEmail: "owner@example.com",
        bikeName: "Ford Focus",
        decisionToken: "fresh-decision-token",
        isReminder: true,
      })
    );
    expect(mocks.recordCarReminderSent).toHaveBeenCalledWith("req-1", "owner@example.com");
  });

  it("still records the reminder as sent even if the email itself fails to send", async () => {
    mocks.sendReceiptRequestEmail.mockRejectedValue(new Error("Resend is down"));

    const response = await POST(request(JSON.stringify({ entryId: "e1" })), { params: Promise.resolve({ token: "tok-a" }) });

    expect(response.status).toBe(200);
    expect(mocks.recordCarReminderSent).toHaveBeenCalledWith("req-1", "owner@example.com");
  });

  it("only includes still-pending items in the reminder email, not already-decided ones", async () => {
    await POST(request(JSON.stringify({ entryId: "e1" })), { params: Promise.resolve({ token: "tok-a" }) });

    const callArg = mocks.sendReceiptRequestEmail.mock.calls[0][0];
    expect(callArg.items).toEqual([{ entryId: "e1", status: "pending" }]);
  });
});
