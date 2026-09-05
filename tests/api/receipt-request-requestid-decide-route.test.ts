import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  decideReceiptRequestItems: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/receiptRequest", () => ({
  decideReceiptRequestItems: mocks.decideReceiptRequestItems,
}));

import { POST } from "@/app/api/tracker/receipt-request/[requestId]/decide/route";

function request(requestId: string, body: object): NextRequest {
  return new NextRequest(
    `http://localhost/api/tracker/receipt-request/${requestId}/decide`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function badRequest(requestId: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/tracker/receipt-request/${requestId}/decide`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    }
  );
}

const email = "owner@example.com";
const requestId = "req-123";
const updatedItems = [{ id: "entry-1", decision: "approved" }];

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email });
  mocks.decideReceiptRequestItems.mockResolvedValue({ items: updatedItems });
});

describe("POST /api/tracker/receipt-request/[requestId]/decide", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(requestId, { decision: "approved" }), { params: Promise.resolve({ requestId }) });
    expect(response.status).toBe(401);
    expect(mocks.decideReceiptRequestItems).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(badRequest(requestId), { params: Promise.resolve({ requestId }) });
    expect(response.status).toBe(400);
    expect(mocks.decideReceiptRequestItems).not.toHaveBeenCalled();
  });

  it("returns 400 when decision is missing", async () => {
    const response = await POST(request(requestId, {}), { params: Promise.resolve({ requestId }) });
    expect(response.status).toBe(400);
    expect(mocks.decideReceiptRequestItems).not.toHaveBeenCalled();
  });

  it("returns 400 when decision is not a recognised value", async () => {
    const response = await POST(
      request(requestId, { decision: "maybe" }),
      { params: Promise.resolve({ requestId }) }
    );
    expect(response.status).toBe(400);
    expect(mocks.decideReceiptRequestItems).not.toHaveBeenCalled();
  });

  it("accepts 'approved' as a valid decision", async () => {
    const response = await POST(
      request(requestId, { decision: "approved" }),
      { params: Promise.resolve({ requestId }) }
    );
    expect(response.status).toBe(200);
  });

  it("accepts 'declined' as a valid decision", async () => {
    const response = await POST(
      request(requestId, { decision: "declined" }),
      { params: Promise.resolve({ requestId }) }
    );
    expect(response.status).toBe(200);
  });

  it("accepts 'pending' as a valid decision", async () => {
    const response = await POST(
      request(requestId, { decision: "pending" }),
      { params: Promise.resolve({ requestId }) }
    );
    expect(response.status).toBe(200);
  });

  it("returns 404 when decideReceiptRequestItems returns null", async () => {
    mocks.decideReceiptRequestItems.mockResolvedValue(null);
    const response = await POST(
      request(requestId, { decision: "approved" }),
      { params: Promise.resolve({ requestId }) }
    );
    expect(response.status).toBe(404);
  });

  it("returns ok:true and the updated items on success", async () => {
    const response = await POST(
      request(requestId, { decision: "approved" }),
      { params: Promise.resolve({ requestId }) }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, items: updatedItems });
  });

  it("defaults entryIds to 'all' when not provided", async () => {
    await POST(request(requestId, { decision: "approved" }), { params: Promise.resolve({ requestId }) });
    expect(mocks.decideReceiptRequestItems).toHaveBeenCalledWith(
      requestId,
      email,
      "all",
      "approved",
      undefined
    );
  });

  it("passes through explicit entryIds when provided", async () => {
    const entryIds = ["entry-1", "entry-2"];
    await POST(
      request(requestId, { decision: "declined", entryIds }),
      { params: Promise.resolve({ requestId }) }
    );
    expect(mocks.decideReceiptRequestItems).toHaveBeenCalledWith(
      requestId,
      email,
      entryIds,
      "declined",
      undefined
    );
  });

  it("passes through a reason when provided", async () => {
    await POST(
      request(requestId, { decision: "declined", reason: "Not my bike" }),
      { params: Promise.resolve({ requestId }) }
    );
    expect(mocks.decideReceiptRequestItems).toHaveBeenCalledWith(
      requestId,
      email,
      "all",
      "declined",
      "Not my bike"
    );
  });

  it("uses the requestId from the route params, not anything in the body", async () => {
    await POST(request(requestId, { decision: "approved" }), { params: Promise.resolve({ requestId }) });
    // Just assert the first arg is the route param — the rest are already
    // covered by the specific passing tests above.
    const firstArg = mocks.decideReceiptRequestItems.mock.calls[0][0];
    expect(firstArg).toBe(requestId);
  });
});
