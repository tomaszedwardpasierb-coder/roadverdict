import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getReceiptRequestByDecisionToken: vi.fn(),
  decideReceiptRequestItems: vi.fn(),
}));

vi.mock("@/lib/tracker/receiptRequest", () => ({
  getReceiptRequestByDecisionToken: mocks.getReceiptRequestByDecisionToken,
  decideReceiptRequestItems: mocks.decideReceiptRequestItems,
}));

import { POST } from "@/app/api/report/receipt-request/decide/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/report/receipt-request/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

// No session anywhere in this route on purpose - the person deciding is
// reading this from an emailed link, not signed in on this device. The
// decision token IS the authentication; every test here is really
// testing that the token is treated as the sole gate correctly.
describe("POST /api/report/receipt-request/decide", () => {
  beforeEach(() => {
    mocks.getReceiptRequestByDecisionToken.mockReset();
    mocks.decideReceiptRequestItems.mockReset();
    mocks.getReceiptRequestByDecisionToken.mockResolvedValue({ id: "req-1", pk: "owner@example.com" });
    mocks.decideReceiptRequestItems.mockResolvedValue({ items: [{ entryId: "e1", status: "approved" }] });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("not-json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    expect(mocks.getReceiptRequestByDecisionToken).not.toHaveBeenCalled();
  });

  it("rejects a missing token", async () => {
    const response = await POST(request(JSON.stringify({ decision: "approved" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("rejects a decision value outside the known set", async () => {
    const response = await POST(request(JSON.stringify({ token: "tok-1", decision: "maybe" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    expect(mocks.getReceiptRequestByDecisionToken).not.toHaveBeenCalled();
  });

  it("returns not found for a token that doesn't resolve to a real request", async () => {
    mocks.getReceiptRequestByDecisionToken.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({ token: "expired-or-fake", decision: "approved" })));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "This request link is no longer valid." });
    expect(mocks.decideReceiptRequestItems).not.toHaveBeenCalled();
  });

  it("defaults to deciding all items when entryIds is omitted", async () => {
    const response = await POST(request(JSON.stringify({ token: "tok-1", decision: "approved" })));

    expect(response.status).toBe(200);
    expect(mocks.decideReceiptRequestItems).toHaveBeenCalledWith(
      "req-1", "owner@example.com", "all", "approved", undefined
    );
  });

  it("passes specific entryIds, decision, and reason through unchanged", async () => {
    const response = await POST(request(JSON.stringify({
      token: "tok-1",
      decision: "declined",
      entryIds: ["e1", "e2"],
      reason: "Contains my home address",
    })));

    expect(response.status).toBe(200);
    expect(mocks.decideReceiptRequestItems).toHaveBeenCalledWith(
      "req-1", "owner@example.com", ["e1", "e2"], "declined", "Contains my home address"
    );
  });

  // Edge case in the real code's own null-coalescing (updated?.items ?? []) -
  // if the request disappeared between the two lookups, this still
  // responds ok rather than erroring, just with an empty item list.
  it("responds ok with an empty item list if the request vanished between lookup and decision", async () => {
    mocks.decideReceiptRequestItems.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({ token: "tok-1", decision: "approved" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, items: [] });
  });
});