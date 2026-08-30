import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  createBikeTransferRequest: vi.fn(),
  getPendingTransferRequestsForOwner: vi.fn(),
  hasActiveTransferRequestForBike: vi.fn(),
  sendBikeTransferOfferEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({ getPrimaryBike: mocks.getPrimaryBike, isBikeReadOnly: mocks.isBikeReadOnly }));
vi.mock("@/lib/tracker/bikeTransferRequest", () => ({
  createBikeTransferRequest: mocks.createBikeTransferRequest,
  getPendingTransferRequestsForOwner: mocks.getPendingTransferRequestsForOwner,
  hasActiveTransferRequestForBike: mocks.hasActiveTransferRequestForBike,
}));
vi.mock("@/lib/resend", () => ({ sendBikeTransferOfferEmail: mocks.sendBikeTransferOfferEmail }));

import { GET, POST } from "@/app/api/tracker/bike-transfer/route";

function postRequest(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bike-transfer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validBike = { id: "bike-1", make: "Yamaha", model: "MT-07", year: 2018, isCustomBuild: false };

describe("GET /api/tracker/bike-transfer", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the signed-in owner's own pending requests", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPendingTransferRequestsForOwner.mockResolvedValue([{ id: "req-1" }]);

    const response = await GET();

    expect(mocks.getPendingTransferRequestsForOwner).toHaveBeenCalledWith("owner@example.com");
    await expect(response.json()).resolves.toEqual({ requests: [{ id: "req-1" }] });
  });
});

describe("POST /api/tracker/bike-transfer (owner-initiated offer)", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue(validBike);
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.hasActiveTransferRequestForBike.mockResolvedValue(false);
    mocks.createBikeTransferRequest.mockResolvedValue({ doc: { id: "req-1", bikeSummary: validBike }, token: "tok-1" });
    mocks.sendBikeTransferOfferEmail.mockResolvedValue(undefined);
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
    expect(mocks.createBikeTransferRequest).not.toHaveBeenCalled();
  });

  it("rejects starting a handover to your own account", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "OWNER@example.com" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "You can't start a handover to your own account." });
  });

  it("returns not found when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));
    expect(response.status).toBe(404);
  });

  it("refuses to offer a bike that's already been transferred", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));
    expect(response.status).toBe(403);
    expect(mocks.createBikeTransferRequest).not.toHaveBeenCalled();
  });

  it("refuses a second offer while one is already in progress", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.hasActiveTransferRequestForBike.mockResolvedValue(true);
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));
    expect(response.status).toBe(409);
    expect(mocks.createBikeTransferRequest).not.toHaveBeenCalled();
  });

  it("normalises the recipient email (trims and lowercases) before creating the request", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(postRequest(JSON.stringify({ recipientEmail: "  Buyer@Example.com  " })));
    expect(mocks.createBikeTransferRequest).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "buyer@example.com" })
    );
  });

  it("defaults includeRecords to true when not specified", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));
    expect(mocks.createBikeTransferRequest).toHaveBeenCalledWith(expect.objectContaining({ includeRecords: true }));
  });

  // The offer document is real even if the email never sends - worth
  // surfacing that as an error rather than silently succeeding, since
  // without the email the recipient has no way to discover the offer.
  it("surfaces an error if the offer email fails to send, even though the offer document was already created", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.sendBikeTransferOfferEmail.mockRejectedValue(new Error("send failed"));

    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));

    expect(response.status).toBe(502);
    expect(mocks.createBikeTransferRequest).toHaveBeenCalled(); // the doc was still created
  });

  it("creates a valid offer and sends the email", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(postRequest(JSON.stringify({ recipientEmail: "buyer@example.com" })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, requestId: "req-1" });
  });
});