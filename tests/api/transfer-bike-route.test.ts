import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  transferBike: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
// transferBike's own invariants (already_transferred, same_owner,
// recipient caps, etc.) are exhaustively covered at the lib level in
// tests/unit/bikeTransfer.test.ts - mocked here so this route test
// only re-confirms those same invariants surface correctly through the
// admin route's status codes, without re-deriving the lib's internals.
vi.mock("@/lib/tracker/bikeTransfer", () => ({ transferBike: mocks.transferBike }));

import { POST } from "@/app/api/tomasz/transfer-bike/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/transfer-bike", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validBody = { fromEmail: "seller@example.com", bikeId: "bike-1", toEmail: "buyer@example.com" };

describe("POST /api/tomasz/transfer-bike", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.transferBike.mockResolvedValue({ ok: true, newBike: { id: "new-bike-id" } });
  });

  it("rejects a non-admin request outright, without ever calling transferBike", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(401);
    expect(mocks.transferBike).not.toHaveBeenCalled();
  });

  it("rejects a request with no admin session cookie at all", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not signed in as admin." });
  });

  it("rejects malformed JSON", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
    expect(mocks.transferBike).not.toHaveBeenCalled();
  });

  it("rejects a request missing any of fromEmail, bikeId or toEmail", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ fromEmail: "seller@example.com", bikeId: "bike-1" })));
    expect(response.status).toBe(400);
    expect(mocks.transferBike).not.toHaveBeenCalled();
  });

  it("normalises fromEmail and toEmail (trims and lowercases) before calling transferBike", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(request(JSON.stringify({ fromEmail: "  Seller@Example.com  ", bikeId: "bike-1", toEmail: "  Buyer@Example.com  " })));
    expect(mocks.transferBike).toHaveBeenCalledWith("seller@example.com", "bike-1", "buyer@example.com", true);
  });

  it("defaults includeRecords to true when not specified", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(request(JSON.stringify(validBody)));
    expect(mocks.transferBike).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String), true);
  });

  it("passes includeRecords: false through when explicitly requested", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    await POST(request(JSON.stringify({ ...validBody, includeRecords: false })));
    expect(mocks.transferBike).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String), false);
  });

  // The invariant established at the lib level in bikeTransfer.test.ts:
  // an already-transferred (read-only) bike must not be transferable
  // again. The admin route must surface this, not silently succeed or
  // bypass it with some admin-only override.
  it("refuses to force-transfer a bike that's already been transferred", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.transferBike.mockResolvedValue({ ok: false, reason: "already_transferred" });
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This bike has already been transferred - it's now read-only.",
    });
  });

  it("returns 404 when the source bike doesn't exist on that account", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.transferBike.mockResolvedValue({ ok: false, reason: "bike_not_found" });
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(404);
  });

  it("refuses a same-account transfer, same as the lib-level invariant", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.transferBike.mockResolvedValue({ ok: false, reason: "same_owner" });
    const response = await POST(request(JSON.stringify({ ...validBody, toEmail: validBody.fromEmail })));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "fromEmail and toEmail are the same account." });
  });

  it("respects the recipient's free-bike cap - an admin transfer cannot bypass it", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.transferBike.mockResolvedValue({ ok: false, reason: "recipient_limit_reached", limit: 2 });
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Recipient already has the maximum of 2 bikes." });
  });

  it("refuses when the recipient already has an active bike under this same registration", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.transferBike.mockResolvedValue({ ok: false, reason: "recipient_already_has_bike" });
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(409);
  });

  it("returns the new bike on a successful admin-forced transfer", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.transferBike.mockResolvedValue({ ok: true, newBike: { id: "new-bike-id", make: "Yamaha" } });
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ newBike: { id: "new-bike-id", make: "Yamaha" } });
  });
});
