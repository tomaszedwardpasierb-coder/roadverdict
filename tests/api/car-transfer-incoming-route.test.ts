// Mirrors bike-transfer-incoming-route.test.ts for the car equivalent routes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCarTransferRequestById: vi.fn(),
  decideCarTransferRequest: vi.fn(),
  transferCar: vi.fn(),
  sendCarOwnershipRequestApprovedEmail: vi.fn(),
  sendCarOwnershipRequestDeclinedEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/carTransferRequest", () => ({
  getCarTransferRequestById: mocks.getCarTransferRequestById,
  decideCarTransferRequest: mocks.decideCarTransferRequest,
}));
vi.mock("@/lib/tracker/carTransfer", () => ({ transferCar: mocks.transferCar }));
vi.mock("@/lib/resend", () => ({
  sendCarOwnershipRequestApprovedEmail: mocks.sendCarOwnershipRequestApprovedEmail,
  sendCarOwnershipRequestDeclinedEmail: mocks.sendCarOwnershipRequestDeclinedEmail,
}));

import { POST as APPROVE } from "@/app/api/cars/car-transfer/incoming/[requestId]/approve/route";
import { POST as DECLINE } from "@/app/api/cars/car-transfer/incoming/[requestId]/decline/route";

function request(body?: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-transfer/incoming/req-1/approve", {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  });
}

const recipientInitiatedDoc = {
  id: "req-1",
  ownerEmail: "seller@example.com",
  recipientEmail: "buyer@example.com",
  carId: "car-1",
  carSummary: { make: "Ford", model: "Focus", year: 2018, isCustomBuild: false },
  status: "pending",
  initiatedBy: "recipient",
};

describe("POST /api/cars/car-transfer/incoming/[requestId]/approve", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getCarTransferRequestById.mockResolvedValue(recipientInitiatedDoc);
    mocks.transferCar.mockResolvedValue({ ok: true, newCar: { id: "new-car-1" } });
    mocks.sendCarOwnershipRequestApprovedEmail.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await APPROVE(request(), { params: Promise.resolve({ requestId: "req-1" }) });
    expect(response.status).toBe(401);
  });

  it("scopes the lookup to the signed-in owner via the partition key, not a client-supplied id alone", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    await APPROVE(request(), { params: Promise.resolve({ requestId: "req-1" }) });
    expect(mocks.getCarTransferRequestById).toHaveBeenCalledWith("req-1", "seller@example.com");
  });

  it("returns not found when the request doesn't exist for this owner", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.getCarTransferRequestById.mockResolvedValue(null);
    const response = await APPROVE(request(), { params: Promise.resolve({ requestId: "req-1" }) });
    expect(response.status).toBe(404);
  });

  it("refuses an owner-initiated offer routed here by mistake", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.getCarTransferRequestById.mockResolvedValue({ ...recipientInitiatedDoc, initiatedBy: "owner" });

    const response = await APPROVE(request(), { params: Promise.resolve({ requestId: "req-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.transferCar).not.toHaveBeenCalled();
  });

  it("refuses a request that's already been decided", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.getCarTransferRequestById.mockResolvedValue({ ...recipientInitiatedDoc, status: "declined" });
    const response = await APPROVE(request(), { params: Promise.resolve({ requestId: "req-1" }) });
    expect(response.status).toBe(409);
  });

  it("defaults includeRecords to true when no body is sent at all", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    await APPROVE(request(), { params: Promise.resolve({ requestId: "req-1" }) });
    expect(mocks.transferCar).toHaveBeenCalledWith("seller@example.com", "car-1", "buyer@example.com", true);
  });

  it("respects an explicit includeRecords: false", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    await APPROVE(request(JSON.stringify({ includeRecords: false })), { params: Promise.resolve({ requestId: "req-1" }) });
    expect(mocks.transferCar).toHaveBeenCalledWith("seller@example.com", "car-1", "buyer@example.com", false);
  });

  it("surfaces the owner-side wording for a vehicle-limit failure, distinct from the recipient-side wording", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.transferCar.mockResolvedValue({ ok: false, reason: "recipient_limit_reached", limit: 3 });

    const response = await APPROVE(request(), { params: Promise.resolve({ requestId: "req-1" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "The requester already has the maximum of 3 vehicles and can't accept this right now.",
    });
  });

  it("approves a valid request and returns the new car", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });

    const response = await APPROVE(request(), { params: Promise.resolve({ requestId: "req-1" }) });

    expect(mocks.decideCarTransferRequest).toHaveBeenCalledWith("req-1", "seller@example.com", "accepted");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, newCar: { id: "new-car-1" } });
  });

  it("still succeeds even if the approved-notification email fails to send", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.sendCarOwnershipRequestApprovedEmail.mockRejectedValue(new Error("send failed"));
    const response = await APPROVE(request(), { params: Promise.resolve({ requestId: "req-1" }) });
    expect(response.status).toBe(200);
  });
});

describe("POST /api/cars/car-transfer/incoming/[requestId]/decline", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getCarTransferRequestById.mockResolvedValue(recipientInitiatedDoc);
    mocks.sendCarOwnershipRequestDeclinedEmail.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DECLINE(request(), { params: Promise.resolve({ requestId: "req-1" }) });
    expect(response.status).toBe(401);
  });

  it("refuses an owner-initiated offer routed here by mistake", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.getCarTransferRequestById.mockResolvedValue({ ...recipientInitiatedDoc, initiatedBy: "owner" });
    const response = await DECLINE(request(), { params: Promise.resolve({ requestId: "req-1" }) });
    expect(response.status).toBe(400);
  });

  it("refuses a request that's already been decided", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    mocks.getCarTransferRequestById.mockResolvedValue({ ...recipientInitiatedDoc, status: "accepted" });
    const response = await DECLINE(request(), { params: Promise.resolve({ requestId: "req-1" }) });
    expect(response.status).toBe(409);
  });

  it("declines a valid, pending request", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    const response = await DECLINE(request(), { params: Promise.resolve({ requestId: "req-1" }) });
    expect(mocks.decideCarTransferRequest).toHaveBeenCalledWith("req-1", "seller@example.com", "declined");
    expect(response.status).toBe(200);
  });
});
