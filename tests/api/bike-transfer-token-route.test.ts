import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBikeTransferRequestByToken: vi.fn(),
  decideBikeTransferRequest: vi.fn(),
  transferBike: vi.fn(),
  sendBikeTransferAcceptedEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bikeTransferRequest", () => ({
  getBikeTransferRequestByToken: mocks.getBikeTransferRequestByToken,
  decideBikeTransferRequest: mocks.decideBikeTransferRequest,
}));
vi.mock("@/lib/tracker/bikeTransfer", () => ({ transferBike: mocks.transferBike }));
vi.mock("@/lib/resend", () => ({ sendBikeTransferAcceptedEmail: mocks.sendBikeTransferAcceptedEmail }));

import { GET } from "@/app/api/tracker/bike-transfer/[token]/route";
import { POST as ACCEPT } from "@/app/api/tracker/bike-transfer/[token]/accept/route";
import { POST as DECLINE } from "@/app/api/tracker/bike-transfer/[token]/decline/route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bike-transfer/tok/accept", { method: "POST" });
}

const pendingDoc = {
  id: "req-1",
  ownerEmail: "seller@example.com",
  recipientEmail: "buyer@example.com",
  bikeId: "bike-1",
  bikeSummary: { make: "Yamaha", model: "MT-07", year: 2018, isCustomBuild: false },
  status: "pending",
  includeRecords: true,
  createdAt: "2025-06-01",
};

describe("GET /api/tracker/bike-transfer/[token]", () => {
  it("returns not found for an unknown or expired token", async () => {
    mocks.getBikeTransferRequestByToken.mockResolvedValue(null);
    const response = await GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ token: "bad" }) });
    expect(response.status).toBe(404);
  });

  it("returns the offer's public details for a real token, with no auth required", async () => {
    mocks.getBikeTransferRequestByToken.mockResolvedValue(pendingDoc);
    const response = await GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ownerEmail: "seller@example.com",
      recipientEmail: "buyer@example.com",
      bikeSummary: pendingDoc.bikeSummary,
      status: "pending",
      createdAt: "2025-06-01",
    });
  });
});

describe("POST /api/tracker/bike-transfer/[token]/accept", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getBikeTransferRequestByToken.mockResolvedValue(pendingDoc);
    mocks.transferBike.mockResolvedValue({ ok: true, newBike: { id: "new-bike-1" } });
    mocks.sendBikeTransferAcceptedEmail.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests - unlike decline, accept requires sign-in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(401);
  });

  it("returns not found for an unknown or expired token", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.getBikeTransferRequestByToken.mockResolvedValue(null);
    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "bad" }) });
    expect(response.status).toBe(404);
  });

  it("refuses an offer that's already been decided", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.getBikeTransferRequestByToken.mockResolvedValue({ ...pendingDoc, status: "declined" });
    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "This offer has already been declined." });
  });

  // The core identity check this route exists to enforce: a valid,
  // pending token is not by itself enough - offer links get forwarded
  // or sit in the wrong inbox, so only the account it was actually
  // addressed to can act on it.
  it("refuses to let anyone but the addressed recipient accept, even with a valid pending token", async () => {
    mocks.getSession.mockResolvedValue({ email: "someone-else@example.com" });

    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(403);
    expect(mocks.transferBike).not.toHaveBeenCalled();
  });

  // Every distinct failure reason transferBike can return gets its own
  // specific error message here, not a single generic failure.
  it.each([
    ["bike_not_found", 404, "This bike is no longer on the original account."],
    ["already_transferred", 409, "This bike has already been transferred elsewhere."],
    ["same_owner", 400, "You can't accept a handover to your own account."],
    ["recipient_already_has_bike", 409, "You already have a separate bike on your account with this same registration - resolve that one first (most likely by deleting it, if it was a fresh start for this same bike), then try accepting again."],
  ])("surfaces the specific error for transferBike reason %s", async (reason, status, message) => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.transferBike.mockResolvedValue({ ok: false, reason });

    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: message });
    expect(mocks.decideBikeTransferRequest).not.toHaveBeenCalled();
  });

  it("surfaces the recipient's bike limit in the error message", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.transferBike.mockResolvedValue({ ok: false, reason: "recipient_limit_reached", limit: 3 });

    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "You already have the maximum of 3 bikes. Remove one first, then try again.",
    });
  });

  it("marks the request accepted and returns the new bike on success", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });

    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(mocks.transferBike).toHaveBeenCalledWith("seller@example.com", "bike-1", "buyer@example.com", true);
    expect(mocks.decideBikeTransferRequest).toHaveBeenCalledWith("req-1", "seller@example.com", "accepted");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, newBike: { id: "new-bike-1" } });
  });

  // The transfer itself is the part that actually matters - a failed
  // notification email must not undo or fail an already-successful
  // ownership change.
  it("still succeeds even if the accepted-notification email fails to send", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.sendBikeTransferAcceptedEmail.mockRejectedValue(new Error("send failed"));

    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(200);
  });
});

describe("POST /api/tracker/bike-transfer/[token]/decline", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getBikeTransferRequestByToken.mockResolvedValue(pendingDoc);
  });

  // Explicitly no identity check at all - the source comment states
  // this is deliberate: declining moves no data, so there's no reason
  // to require an account just to say no to an unwanted offer.
  it("requires no sign-in at all, unlike accept", async () => {
    mocks.getSession.mockResolvedValue(null); // even if this were checked, it isn't called

    const response = await DECLINE(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("returns not found for an unknown or expired token", async () => {
    mocks.getBikeTransferRequestByToken.mockResolvedValue(null);
    const response = await DECLINE(req(), { params: Promise.resolve({ token: "bad" }) });
    expect(response.status).toBe(404);
  });

  it("refuses an offer that's already been decided", async () => {
    mocks.getBikeTransferRequestByToken.mockResolvedValue({ ...pendingDoc, status: "accepted" });
    const response = await DECLINE(req(), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(409);
  });

  it("marks a valid pending offer as declined", async () => {
    const response = await DECLINE(req(), { params: Promise.resolve({ token: "tok-1" }) });
    expect(mocks.decideBikeTransferRequest).toHaveBeenCalledWith("req-1", "seller@example.com", "declined");
    expect(response.status).toBe(200);
  });
});