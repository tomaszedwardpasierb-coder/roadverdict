import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBikeTransferRequestById: vi.fn(),
  decideBikeTransferRequest: vi.fn(),
  transferBike: vi.fn(),
  sendOwnershipRequestApprovedEmail: vi.fn(),
  sendOwnershipRequestDeclinedEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bikeTransferRequest", () => ({
  getBikeTransferRequestById: mocks.getBikeTransferRequestById,
  decideBikeTransferRequest: mocks.decideBikeTransferRequest,
}));
vi.mock("@/lib/tracker/bikeTransfer", () => ({ transferBike: mocks.transferBike }));
vi.mock("@/lib/resend", () => ({
  sendOwnershipRequestApprovedEmail: mocks.sendOwnershipRequestApprovedEmail,
  sendOwnershipRequestDeclinedEmail: mocks.sendOwnershipRequestDeclinedEmail,
}));

import { POST as APPROVE } from "@/app/api/tracker/bike-transfer/incoming/[requestId]/approve/route";
import { POST as DECLINE } from "@/app/api/tracker/bike-transfer/incoming/[requestId]/decline/route";

function request(body?: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bike-transfer/incoming/req-1/approve", {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  });
}

const recipientInitiatedDoc = {
  id: "req-1",
  ownerEmail: "seller@example.com",
  recipientEmail: "buyer@example.com",
  bikeId: "bike-1",
  bikeSummary: { make: "Yamaha", model: "MT-07", year: 2018, isCustomBuild: false },
  status: "pending",
  initiatedBy: "recipient",
};

describe("POST /api/tracker/bike-transfer/incoming/[requestId]/approve", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getBikeTransferRequestById.mockResolvedValue(recipientInitiatedDoc);
    mocks.transferBike.mockResolvedValue({ ok: true, newBike: { id: "new-bike-1" } });
    mocks.sendOwnershipRequestApprovedEmail.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await APPROVE(request(), { params: { requestId: "req-1" } });
    expect(response.status).toBe(401);
  });

  it("scopes the lookup to the signed-in owner via the partition key, not a client-supplied id alone", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    await APPROVE(request(), { params: { requestId: "req-1" } });
    expect(mocks.getBikeTransferRequestById).toHaveBeenCalledWith("req-1", "seller@example.com");
  });

  it("returns not found when the request doesn't exist for this owner", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.getBikeTransferRequestById.mockResolvedValue(null);
    const response = await APPROVE(request(), { params: { requestId: "req-1" } });
    expect(response.status).toBe(404);
  });

  // The "belt and braces" check the source comment describes: this
  // route only makes sense for a request someone ELSE initiated toward
  // this account - an owner-initiated offer must go through the
  // token-based accept route instead, never this one.
  it("refuses an owner-initiated offer routed here by mistake", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.getBikeTransferRequestById.mockResolvedValue({ ...recipientInitiatedDoc, initiatedBy: "owner" });

    const response = await APPROVE(request(), { params: { requestId: "req-1" } });

    expect(response.status).toBe(400);
    expect(mocks.transferBike).not.toHaveBeenCalled();
  });

  it("refuses a request that's already been decided", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.getBikeTransferRequestById.mockResolvedValue({ ...recipientInitiatedDoc, status: "declined" });
    const response = await APPROVE(request(), { params: { requestId: "req-1" } });
    expect(response.status).toBe(409);
  });

  // No body at all is a legitimate, expected case here, not an error -
  // defaults to including records.
  it("defaults includeRecords to true when no body is sent at all", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    await APPROVE(request(), { params: { requestId: "req-1" } }); // request() with no body arg
    expect(mocks.transferBike).toHaveBeenCalledWith("seller@example.com", "bike-1", "buyer@example.com", true);
  });

  it("respects an explicit includeRecords: false", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    await APPROVE(request(JSON.stringify({ includeRecords: false })), { params: { requestId: "req-1" } });
    expect(mocks.transferBike).toHaveBeenCalledWith("seller@example.com", "bike-1", "buyer@example.com", false);
  });

  it("surfaces the owner-side wording for a bike-limit failure, distinct from the recipient-side wording", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.transferBike.mockResolvedValue({ ok: false, reason: "recipient_limit_reached", limit: 3 });

    const response = await APPROVE(request(), { params: { requestId: "req-1" } });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "The requester already has the maximum of 3 bikes and can't accept this right now.",
    });
  });

  it("approves a valid request and returns the new bike", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });

    const response = await APPROVE(request(), { params: { requestId: "req-1" } });

    expect(mocks.decideBikeTransferRequest).toHaveBeenCalledWith("req-1", "seller@example.com", "accepted");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, newBike: { id: "new-bike-1" } });
  });

  it("still succeeds even if the approved-notification email fails to send", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.sendOwnershipRequestApprovedEmail.mockRejectedValue(new Error("send failed"));
    const response = await APPROVE(request(), { params: { requestId: "req-1" } });
    expect(response.status).toBe(200);
  });
});

describe("POST /api/tracker/bike-transfer/incoming/[requestId]/decline", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getBikeTransferRequestById.mockResolvedValue(recipientInitiatedDoc);
    mocks.sendOwnershipRequestDeclinedEmail.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DECLINE(request(), { params: { requestId: "req-1" } });
    expect(response.status).toBe(401);
  });

  it("refuses an owner-initiated offer routed here by mistake", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.getBikeTransferRequestById.mockResolvedValue({ ...recipientInitiatedDoc, initiatedBy: "owner" });
    const response = await DECLINE(request(), { params: { requestId: "req-1" } });
    expect(response.status).toBe(400);
  });

  it("refuses a request that's already been decided", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.getBikeTransferRequestById.mockResolvedValue({ ...recipientInitiatedDoc, status: "accepted" });
    const response = await DECLINE(request(), { params: { requestId: "req-1" } });
    expect(response.status).toBe(409);
  });

  it("declines a valid, pending request", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    const response = await DECLINE(request(), { params: { requestId: "req-1" } });
    expect(mocks.decideBikeTransferRequest).toHaveBeenCalledWith("req-1", "seller@example.com", "declined");
    expect(response.status).toBe(200);
  });
});