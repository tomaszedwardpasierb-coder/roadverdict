// Mirrors bike-transfer-route.test.ts for the car equivalent route.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  createCarTransferRequest: vi.fn(),
  getPendingCarTransferRequestsForOwner: vi.fn(),
  hasActiveCarTransferRequestForCar: vi.fn(),
  sendCarTransferOfferEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({ getPrimaryCar: mocks.getPrimaryCar, isCarReadOnly: mocks.isCarReadOnly }));
vi.mock("@/lib/tracker/carTransferRequest", () => ({
  createCarTransferRequest: mocks.createCarTransferRequest,
  getPendingCarTransferRequestsForOwner: mocks.getPendingCarTransferRequestsForOwner,
  hasActiveCarTransferRequestForCar: mocks.hasActiveCarTransferRequestForCar,
}));
vi.mock("@/lib/resend", () => ({ sendCarTransferOfferEmail: mocks.sendCarTransferOfferEmail }));

import { GET, POST } from "@/app/api/cars/car-transfer/route";

function postRequest(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-transfer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validCar = { id: "car-1", make: "Ford", model: "Focus", year: 2018, isCustomBuild: false };

describe("GET /api/cars/car-transfer", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the signed-in owner's own pending requests", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPendingCarTransferRequestsForOwner.mockResolvedValue([{ id: "req-1" }]);

    const response = await GET();

    expect(mocks.getPendingCarTransferRequestsForOwner).toHaveBeenCalledWith("owner@example.com");
    await expect(response.json()).resolves.toEqual({ requests: [{ id: "req-1" }] });
  });
});

describe("POST /api/cars/car-transfer (owner-initiated offer)", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue(validCar);
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.hasActiveCarTransferRequestForCar.mockResolvedValue(false);
    mocks.createCarTransferRequest.mockResolvedValue({ doc: { id: "req-1", carSummary: validCar }, token: "tok-1" });
    mocks.sendCarTransferOfferEmail.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(postRequest("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a missing or invalid recipient email", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "not-an-email" })));
    expect(response.status).toBe(400);
    expect(mocks.createCarTransferRequest).not.toHaveBeenCalled();
  });

  it("rejects starting a handover to your own account", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "OWNER@example.com" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "You can't start a handover to your own account." });
  });

  it("returns not found when the account has no car yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue(null);
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));
    expect(response.status).toBe(404);
  });

  it("refuses to offer a car that's already been transferred", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));
    expect(response.status).toBe(403);
    expect(mocks.createCarTransferRequest).not.toHaveBeenCalled();
  });

  it("refuses a second offer while one is already in progress", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.hasActiveCarTransferRequestForCar.mockResolvedValue(true);
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));
    expect(response.status).toBe(409);
    expect(mocks.createCarTransferRequest).not.toHaveBeenCalled();
  });

  it("normalises the recipient email (trims and lowercases) before creating the request", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(postRequest(JSON.stringify({ recipientEmail: "  Buyer@Example.com  " })));
    expect(mocks.createCarTransferRequest).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "buyer@example.com" })
    );
  });

  it("defaults includeRecords to true when not specified", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));
    expect(mocks.createCarTransferRequest).toHaveBeenCalledWith(expect.objectContaining({ includeRecords: true }));
  });

  it("surfaces an error if the offer email fails to send, even though the offer document was already created", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.sendCarTransferOfferEmail.mockRejectedValue(new Error("send failed"));

    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));

    expect(response.status).toBe(502);
    expect(mocks.createCarTransferRequest).toHaveBeenCalled();
  });

  it("creates a valid offer and sends the email", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, requestId: "req-1" });
  });
});
