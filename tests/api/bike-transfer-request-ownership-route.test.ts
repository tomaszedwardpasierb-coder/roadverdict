import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findBikeByRegistrationAcrossAccounts: vi.fn(),
  getBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  createBikeTransferRequest: vi.fn(),
  hasActiveTransferRequestForBike: vi.fn(),
  sendIncomingOwnershipRequestEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  findBikeByRegistrationAcrossAccounts: mocks.findBikeByRegistrationAcrossAccounts,
  getBike: mocks.getBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
}));
vi.mock("@/lib/tracker/bikeTransferRequest", () => ({
  createBikeTransferRequest: mocks.createBikeTransferRequest,
  hasActiveTransferRequestForBike: mocks.hasActiveTransferRequestForBike,
}));
vi.mock("@/lib/resend", () => ({ sendIncomingOwnershipRequestEmail: mocks.sendIncomingOwnershipRequestEmail }));

import { POST } from "@/app/api/tracker/bike-transfer/request-ownership/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bike-transfer/request-ownership", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const match = { ownerEmail: "seller@example.com", bikeId: "bike-1" };
const validBike = { make: "Yamaha", model: "MT-07", year: 2018, isCustomBuild: false };

describe("POST /api/tracker/bike-transfer/request-ownership", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.findBikeByRegistrationAcrossAccounts.mockResolvedValue(match);
    mocks.getBike.mockResolvedValue(validBike);
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.hasActiveTransferRequestForBike.mockResolvedValue(false);
    mocks.createBikeTransferRequest.mockResolvedValue({ doc: { id: "req-1" } });
    mocks.sendIncomingOwnershipRequestEmail.mockResolvedValue(undefined);
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
    expect(mocks.findBikeByRegistrationAcrossAccounts).not.toHaveBeenCalled();
  });

  it("returns not found when no RoadVerdict record matches the registration", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.findBikeByRegistrationAcrossAccounts.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ registration: "AB12CDE" })));
    expect(response.status).toBe(404);
  });

  it("rejects requesting a bike that's already on your own account", async () => {
    mocks.getSession.mockResolvedValue({ email: "seller@example.com" }); // same as match.ownerEmail
    const response = await POST(request(JSON.stringify({ registration: "AB12CDE" })));
    expect(response.status).toBe(400);
    expect(mocks.createBikeTransferRequest).not.toHaveBeenCalled();
  });

  it("returns not found when the matched bike is read-only (already mid-transfer elsewhere)", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify({ registration: "AB12CDE" })));
    expect(response.status).toBe(404);
    expect(mocks.createBikeTransferRequest).not.toHaveBeenCalled();
  });

  it("refuses a second request while one is already in progress", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.hasActiveTransferRequestForBike.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ registration: "AB12CDE" })));
    expect(response.status).toBe(409);
  });

  // The actual privacy/trust boundary this route exists to preserve:
  // only `registration` is ever read from the request body - even if a
  // client tried sending its own bikeId/ownerEmail, the route ignores
  // them entirely and re-derives the real target itself server-side.
  it("re-resolves the target from the registration server-side, ignoring any bikeId/ownerEmail the client might send", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });

    await POST(request(JSON.stringify({
      registration: "AB12CDE",
      bikeId: "attacker-supplied-bike-id",
      ownerEmail: "attacker-supplied-owner@example.com",
    })));

    expect(mocks.createBikeTransferRequest).toHaveBeenCalledWith(
      expect.objectContaining({ ownerEmail: "seller@example.com", bikeId: "bike-1" })
    );
  });

  it("marks the request as recipient-initiated, with the signed-in user as recipient", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    await POST(request(JSON.stringify({ registration: "AB12CDE" })));
    expect(mocks.createBikeTransferRequest).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "buyer@example.com", initiatedBy: "recipient" })
    );
  });

  // Different failure tolerance from the owner-initiated route: here a
  // failed notification email does NOT fail the request, since the
  // request document itself is what matters and the owner will still
  // see it on their dashboard even without the email.
  it("still succeeds even if the notification email fails to send", async () => {
    mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
    mocks.sendIncomingOwnershipRequestEmail.mockRejectedValue(new Error("send failed"));

    const response = await POST(request(JSON.stringify({ registration: "AB12CDE" })));

    expect(response.status).toBe(200);
  });
});