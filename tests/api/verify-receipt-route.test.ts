import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAttachmentContainer: vi.fn(),
  download: vi.fn(),
  getExchangeRates: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: mocks.getAttachmentContainer }));
vi.mock("@/lib/tracker/currencyRates", () => ({ getExchangeRates: mocks.getExchangeRates }));
// currency.ts (convertDisplayToGbp, ALL_CURRENCIES) is deliberately NOT
// mocked - it's pure, already covered by currency.test.ts, and exercising
// the real conversion math here proves the route's own wiring is correct.

import { POST } from "@/app/api/tracker/verify-receipt/route";

function fakeStream(chunks: Buffer[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield c;
    },
  };
}

function geminiTextResponse(text: string, ok = true) {
  return {
    ok,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
}

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/verify-receipt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validBody = { blobName: "abc.jpg", expectedCost: 50, expectedDate: "2025-01-01" };

describe("POST /api/tracker/verify-receipt", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.getAttachmentContainer.mockResolvedValue({ getBlockBlobClient: () => ({ download: mocks.download }) });
    mocks.download.mockResolvedValue({ contentType: "image/jpeg", readableStreamBody: fakeStream([Buffer.from("img")]) });
    mocks.fetch.mockResolvedValue(geminiTextResponse(JSON.stringify({ cost: 50, currency: "GBP", date: "2025-01-01" })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(401);
  });

  // Deliberately not an error - a best-effort helper, not a required
  // step, so the form should carry on rather than show a failure.
  it("returns an unchecked (not error) result when Gemini isn't configured", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ discrepancies: [], checked: false });
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a body missing any required field", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ blobName: "abc.jpg" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing required fields." });
  });

  it("returns unchecked, not an error, for a PDF (out of scope for this first version)", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.download.mockResolvedValue({ contentType: "application/pdf", readableStreamBody: fakeStream([]) });
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ discrepancies: [], checked: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns unchecked when the Gemini call itself isn't ok", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetch.mockResolvedValue(geminiTextResponse("", false));
    const response = await POST(request(JSON.stringify(validBody)));
    await expect(response.json()).resolves.toEqual({ discrepancies: [], checked: false });
  });

  it("returns unchecked when Gemini's response has no text content", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) });
    const response = await POST(request(JSON.stringify(validBody)));
    await expect(response.json()).resolves.toEqual({ discrepancies: [], checked: false });
  });

  it("returns unchecked when Gemini's text isn't valid JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetch.mockResolvedValue(geminiTextResponse("not json at all"));
    const response = await POST(request(JSON.stringify(validBody)));
    await expect(response.json()).resolves.toEqual({ discrepancies: [], checked: false });
  });

  it("reports no discrepancy when the receipt's cost and date match within tolerance", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetch.mockResolvedValue(geminiTextResponse(JSON.stringify({ cost: 50.5, currency: "GBP", date: "2025-01-01" })));
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ discrepancies: [], checked: true });
  });

  it("flags a cost discrepancy outside tolerance in GBP", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetch.mockResolvedValue(geminiTextResponse(JSON.stringify({ cost: 80, currency: "GBP", date: "2025-01-01" })));
    const response = await POST(request(JSON.stringify(validBody)));
    const body = await response.json();
    expect(body.checked).toBe(true);
    expect(body.discrepancies).toEqual([
      "The receipt appears to show 80.00 GBP, which doesn't match the 50.00 entered - worth double-checking.",
    ]);
  });

  // Real conversion math (convertDisplayToGbp), not mocked - proves the
  // route actually converts before comparing, not just for GBP receipts.
  it("converts a foreign-currency cost to GBP before comparing against the tolerance", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getExchangeRates.mockResolvedValue({ base: "GBP", rates: { EUR: 1.15 }, fetchedAt: "2025-01-01T00:00:00.000Z" });
    // 92 EUR / 1.15 = 80 GBP - well outside tolerance of the 50 GBP expected.
    mocks.fetch.mockResolvedValue(geminiTextResponse(JSON.stringify({ cost: 92, currency: "EUR", date: "2025-01-01" })));

    const response = await POST(request(JSON.stringify(validBody)));

    const body = await response.json();
    expect(body.discrepancies).toEqual([
      "The receipt appears to show 92.00 EUR, which doesn't match the 50.00 entered - worth double-checking.",
    ]);
  });

  // Real behaviour worth pinning: an unrecognised currency code is
  // silently treated as already being GBP, since the conversion branch
  // only runs for codes in ALL_CURRENCIES.
  it("treats an unrecognised currency code as GBP directly, without attempting conversion", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetch.mockResolvedValue(geminiTextResponse(JSON.stringify({ cost: 50, currency: "USD", date: "2025-01-01" })));
    const response = await POST(request(JSON.stringify(validBody)));
    await expect(response.json()).resolves.toEqual({ discrepancies: [], checked: true });
    expect(mocks.getExchangeRates).not.toHaveBeenCalled();
  });

  it("flags a date discrepancy", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetch.mockResolvedValue(geminiTextResponse(JSON.stringify({ cost: 50, currency: "GBP", date: "2025-01-05" })));
    const response = await POST(request(JSON.stringify(validBody)));
    const body = await response.json();
    expect(body.discrepancies).toEqual([
      "The receipt appears to be dated 2025-01-05, not 2025-01-01 as entered - worth double-checking.",
    ]);
  });

  it("can report both a cost and a date discrepancy together", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.fetch.mockResolvedValue(geminiTextResponse(JSON.stringify({ cost: 80, currency: "GBP", date: "2025-01-05" })));
    const response = await POST(request(JSON.stringify(validBody)));
    const body = await response.json();
    expect(body.discrepancies).toHaveLength(2);
  });

  // Never blocking or alarming - a verification failure anywhere in the
  // pipeline (here, the blob download itself) falls back to unchecked.
  it("falls back to unchecked (not a 500) when the blob download throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.download.mockRejectedValue(new Error("blob not found"));
    const response = await POST(request(JSON.stringify(validBody)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ discrepancies: [], checked: false });
  });
});