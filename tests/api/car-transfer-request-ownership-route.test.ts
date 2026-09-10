// Mirrors bike-transfer-request-ownership-route.test.ts for the car equivalent route.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findCarByRegistrationAcrossAccounts: vi.fn(),
  getCarById: vi.fn(),
  isCarReadOnly: vi.fn(),
  createCarTransferRequest: vi.fn(),
  hasActiveCarTransferRequestForCar: vi.fn(),
  sendIncomingCarOwnershipRequestEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  findCarByRegistrationAcrossAccounts: mocks.findCarByRegistrationAcrossAccounts,
  getCarById: mocks.getCarById,
  isCarReadOnly: mocks.isCarReadOnly,
}));
vi.mock("@/lib/tracker/carTransferRequest", () => ({
  createCarTransferRequest: mocks.createCarTransferRequest,
  hasActiveCarTransferRequestForCar: mocks.hasActiveCarTransferRequestForCar,
}));
vi.mock("@/lib/resend", () => ({ sendIncomingCarOwnershipRequestEmail: mocks.sendIncomingCarOwnershipRequestEmail }));

import { POST } from "@/app/api/cars/car-transfer/request-ownership/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-transfer/request-ownership", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const match = { ownerEmail: "seller@example.com", carId: "car-1" };
const validCar = { make: "Ford", model: "Focus", year: 2018, isCustomBuild: false };

describe("POST /api/cars/car-transfer/request-ownership", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.findCarByRegistrationAcrossAccounts.mockResolvedValue(match);
    mocks.getCarById.mockResolvedValue(validCar);
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.hasActiveCarTransferRequestForCar.mockResolvedValue(false);
    mocks.createCarTransferRequest.mockResolvedValue({ doc: { id: "req-1" } });
    mocks.sendIncomingCarOwnershipRequestEmail.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ registration: "AB12CDE" })));
    expect(response.status).toBe(401);
  });

  it("rejects a missing registration", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    const response = await POST(request(JSON.stringify({ registration: "  " })));
    expect(response.status).toBe(400);
    expect(mocks.findCarByRegistrationAcrossAccounts).not.toHaveBeenCalled();
  });

  it("returns not found when no RoadVerdict record matches the registration", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.findCarByRegistrationAcrossAccounts.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ registration: "AB12CDE" })));
    expect(response.status).toBe(404);
  });

  it("rejects requesting a car that's already on your own account", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" });
    const response = await POST(request(JSON.stringify({ registration: "AB12CDE" })));
    expect(response.status).toBe(400);
    expect(mocks.createCarTransferRequest).not.toHaveBeenCalled();
  });

  it("returns not found when the matched car is read-only (already mid-transfer elsewhere)", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify({ registration: "AB12CDE" })));
    expect(response.status).toBe(404);
    expect(mocks.createCarTransferRequest).not.toHaveBeenCalled();
  });

  it("refuses a second request while one is already in progress", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.hasActiveCarTransferRequestForCar.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ registration: "AB12CDE" })));
    expect(response.status).toBe(409);
  });

  it("re-resolves the target from the registration server-side, ignoring any carId/ownerEmail the client might send", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });

    await POST(request(JSON.stringify({
      registration: "AB12CDE",
      carId: "attacker-supplied-car-id",
      ownerEmail: "attacker-supplied-owner@example.com",
    })));

    expect(mocks.createCarTransferRequest).toHaveBeenCalledWith(
      expect.objectContaining({ ownerEmail: "seller@example.com", carId: "car-1" })
    );
  });

  it("marks the request as recipient-initiated, with the signed-in user as recipient", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    await POST(request(JSON.stringify({ registration: "AB12CDE" })));
    expect(mocks.createCarTransferRequest).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "buyer@example.com", initiatedBy: "recipient" })
    );
  });

  it("still succeeds even if the notification email fails to send", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.sendIncomingCarOwnershipRequestEmail.mockRejectedValue(new Error("send failed"));

    const response = await POST(request(JSON.stringify({ registration: "AB12CDE" })));

    expect(response.status).toBe(200);
  });
});
