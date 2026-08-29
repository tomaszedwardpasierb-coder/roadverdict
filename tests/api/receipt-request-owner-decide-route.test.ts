import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  decideReceiptRequestItems: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/receiptRequest", () => ({ decideReceiptRequestItems: mocks.decideReceiptRequestItems }));

import { POST } from "@/app/api/tracker/receipt-request/[requestId]/decide/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/receipt-request/req-1/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const params = { requestId: "req-1" };

describe("POST /api/tracker/receipt-request/[requestId]/decide", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.decideReceiptRequestItems.mockReset();
    mocks.decideReceiptRequestItems.mockResolvedValue({ items: [{ entryId: "e1", status: "approved" }] });
  });

  it("rejects unauthenticated requests before reading the body", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(request("not-json"), { params });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not signed in." });
  });

  it("rejects malformed JSON for an authenticated request", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request("not-json"), { params });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("rejects a decision value outside the known set", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ decision: "maybe" })), { params });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
    expect(mocks.decideReceiptRequestItems).not.toHaveBeenCalled();
  });

  // No separate existence check here, unlike the email-token decide route -
  // this goes straight to decideReceiptRequestItems(requestId, session.email, ...),
  // which reads Cosmos by (id, partitionKey). A request that genuinely
  // doesn't exist and a request that exists but belongs to a different
  // owner both come back as the same "not found" from Cosmos - and this
  // route correctly surfaces both as the identical generic message,
  // rather than distinguishing them. That collapse is the safer design:
  // a distinct "that's not yours" response would let someone probe
  // request IDs to learn which ones are real, even without ever getting
  // to act on them.
  it("returns the same generic not-found whether the request doesn't exist or belongs to someone else", async () => {
    mocks.getSession.mockResolvedValue({ email: "attacker@example.com" });
    mocks.decideReceiptRequestItems.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({ decision: "approved" })), { params });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Request not found." });
  });

  // The actual ownership guarantee: session.email is what scopes the
  // Cosmos lookup, and it always comes from the server-verified session,
  // never from anything in the request body - so a body claiming to act
  // as a different owner has no effect at all.
  it("always scopes the decision to the session's own email, ignoring anything else in the body", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    await POST(
      request(JSON.stringify({ decision: "approved", email: "someone-else@example.com" })),
      { params }
    );

    expect(mocks.decideReceiptRequestItems).toHaveBeenCalledWith(
      "req-1", "owner@example.com", "all", "approved", undefined
    );
  });

  it("passes specific entryIds and a reason through unchanged", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(
      request(JSON.stringify({ decision: "declined", entryIds: ["e1"], reason: "Not relevant" })),
      { params }
    );

    expect(response.status).toBe(200);
    expect(mocks.decideReceiptRequestItems).toHaveBeenCalledWith(
      "req-1", "owner@example.com", ["e1"], "declined", "Not relevant"
    );
  });
});