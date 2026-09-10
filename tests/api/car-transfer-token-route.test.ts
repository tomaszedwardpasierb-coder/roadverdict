// Mirrors bike-transfer-token-route.test.ts for the car equivalent routes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCarTransferRequestByToken: vi.fn(),
  decideCarTransferRequest: vi.fn(),
  transferCar: vi.fn(),
  sendCarTransferAcceptedEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/carTransferRequest", () => ({
  getCarTransferRequestByToken: mocks.getCarTransferRequestByToken,
  decideCarTransferRequest: mocks.decideCarTransferRequest,
}));
vi.mock("@/lib/tracker/carTransfer", () => ({ transferCar: mocks.transferCar }));
vi.mock("@/lib/resend", () => ({ sendCarTransferAcceptedEmail: mocks.sendCarTransferAcceptedEmail }));

import { GET } from "@/app/api/cars/car-transfer/[token]/route";
import { POST as ACCEPT } from "@/app/api/cars/car-transfer/[token]/accept/route";
import { POST as DECLINE } from "@/app/api/cars/car-transfer/[token]/decline/route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-transfer/tok/accept", { method: "POST" });
}

const pendingDoc = {
  id: "req-1",
  ownerEmail: "seller@example.com",
  recipientEmail: "buyer@example.com",
  carId: "car-1",
  carSummary: { make: "Ford", model: "Focus", year: 2018, isCustomBuild: false },
  status: "pending",
  includeRecords: true,
  createdAt: "2025-06-01",
};

describe("GET /api/cars/car-transfer/[token]", () => {
  it("returns not found for an unknown or expired token", async () => {
    mocks.getCarTransferRequestByToken.mockResolvedValue(null);
    const response = await GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ token: "bad" }) });
    expect(response.status).toBe(404);
  });

  it("returns the offer's public details for a real token, with no auth required", async () => {
    mocks.getCarTransferRequestByToken.mockResolvedValue(pendingDoc);
    const response = await GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ownerEmail: "seller@example.com",
      recipientEmail: "buyer@example.com",
      carSummary: pendingDoc.carSummary,
      status: "pending",
      createdAt: "2025-06-01",
    });
  });
});

describe("POST /api/cars/car-transfer/[token]/accept", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getCarTransferRequestByToken.mockResolvedValue(pendingDoc);
    mocks.transferCar.mockResolvedValue({ ok: true, newCar: { id: "new-car-1" } });
    mocks.sendCarTransferAcceptedEmail.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests - unlike decline, accept requires sign-in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(401);
  });

  it("returns not found for an unknown or expired token", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.getCarTransferRequestByToken.mockResolvedValue(null);
    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "bad" }) });
    expect(response.status).toBe(404);
  });

  it("refuses an offer that's already been decided", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.getCarTransferRequestByToken.mockResolvedValue({ ...pendingDoc, status: "declined" });
    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "This offer has already been declined." });
  });

  it("refuses to let anyone but the addressed recipient accept, even with a valid pending token", async () => {
    mocks.getSession.mockResolvedValue({ email: "someone-else@example.com" });

    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(403);
    expect(mocks.transferCar).not.toHaveBeenCalled();
  });

  it.each([
    ["car_not_found", 404, "This car is no longer on the original account."],
    ["already_transferred", 409, "This car has already been transferred elsewhere."],
    ["same_owner", 400, "You can't accept a handover to your own account."],
    ["recipient_already_has_car", 409, "You already have a separate car on your account with this same registration - resolve that one first (most likely by deleting it, if it was a fresh start for this same car), then try accepting again."],
  ])("surfaces the specific error for transferCar reason %s", async (reason, status, message) => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.transferCar.mockResolvedValue({ ok: false, reason });

    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: message });
    expect(mocks.decideCarTransferRequest).not.toHaveBeenCalled();
  });

  it("surfaces the recipient's vehicle limit in the error message", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.transferCar.mockResolvedValue({ ok: false, reason: "recipient_limit_reached", limit: 3 });

    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "You already have the maximum of 3 vehicles. Remove one first, then try again.",
    });
  });

  it("marks the request accepted and returns the new car on success", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });

    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(mocks.transferCar).toHaveBeenCalledWith("seller@example.com", "car-1", "buyer@example.com", true);
    expect(mocks.decideCarTransferRequest).toHaveBeenCalledWith("req-1", "seller@example.com", "accepted");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, newCar: { id: "new-car-1" } });
  });

  it("still succeeds even if the accepted-notification email fails to send", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.sendCarTransferAcceptedEmail.mockRejectedValue(new Error("send failed"));

    const response = await ACCEPT(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(200);
  });
});

describe("POST /api/cars/car-transfer/[token]/decline", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getCarTransferRequestByToken.mockResolvedValue(pendingDoc);
  });

  it("requires no sign-in at all, unlike accept", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await DECLINE(req(), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("returns not found for an unknown or expired token", async () => {
    mocks.getCarTransferRequestByToken.mockResolvedValue(null);
    const response = await DECLINE(req(), { params: Promise.resolve({ token: "bad" }) });
    expect(response.status).toBe(404);
  });

  it("refuses an offer that's already been decided", async () => {
    mocks.getCarTransferRequestByToken.mockResolvedValue({ ...pendingDoc, status: "accepted" });
    const response = await DECLINE(req(), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(409);
  });

  it("marks a valid pending offer as declined", async () => {
    const response = await DECLINE(req(), { params: Promise.resolve({ token: "tok-1" }) });
    expect(mocks.decideCarTransferRequest).toHaveBeenCalledWith("req-1", "seller@example.com", "declined");
    expect(response.status).toBe(200);
  });
});
