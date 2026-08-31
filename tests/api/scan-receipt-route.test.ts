import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  parseReceiptFile: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({ getPrimaryBike: mocks.getPrimaryBike }));
vi.mock("@/lib/tracker/receiptParse", () => ({ parseReceiptFile: mocks.parseReceiptFile }));

import { POST } from "@/app/api/tracker/scan-receipt/route";

function requestWithFile(): NextRequest {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array([1, 2, 3])], "receipt.jpg", { type: "image/jpeg" }));
  return new NextRequest("http://localhost/api/tracker/scan-receipt", { method: "POST", body: fd });
}

function requestWithoutFile(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/scan-receipt", { method: "POST", body: new FormData() });
}

function requestBadBody(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/scan-receipt", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body: "not actually multipart",
  });
}

const bike = { id: "bike-1", year: 2019 };

describe("POST /api/tracker/scan-receipt", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    mocks.getPrimaryBike.mockResolvedValue(bike);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(requestWithFile());
    expect(response.status).toBe(401);
    expect(mocks.parseReceiptFile).not.toHaveBeenCalled();
  });

  it("responds 503 when Gemini isn't configured, before even reading the upload", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await POST(requestWithFile());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Receipt scanning isn't configured yet." });
  });

  it("rejects a malformed (non-multipart) upload", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(requestBadBody());
    expect(response.status).toBe(400);
  });

  it("rejects a request with no file", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(requestWithoutFile());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No file provided." });
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await POST(requestWithFile());
    expect(response.status).toBe(404);
  });

  it("surfaces the parser's own error and status when parsing fails outright", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.parseReceiptFile.mockResolvedValue({ ok: false, fileName: "receipt.jpg", error: "Couldn't read this image.", status: 422 });
    const response = await POST(requestWithFile());
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Couldn't read this image." });
  });

  it("returns the full parse result on success", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const result = { ok: true, fileName: "receipt.jpg", summary: "Fuel fill-up", items: [{ category: "fuel" }], skippedBeforeProduction: 0, skippedNonPetrol: 0, skippedUnreadableLitres: 0 };
    mocks.parseReceiptFile.mockResolvedValue(result);
    const response = await POST(requestWithFile());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
  });

  it("passes the signed-in email's bike through to the parser", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.parseReceiptFile.mockResolvedValue({ ok: true, fileName: "receipt.jpg", summary: null, items: [], skippedBeforeProduction: 0, skippedNonPetrol: 0, skippedUnreadableLitres: 0 });
    await POST(requestWithFile());
    expect(mocks.parseReceiptFile).toHaveBeenCalledWith(expect.any(File), "test-key", bike);
  });

  it("reports 422 with a generic message when nothing usable was found and no specific reason applies", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.parseReceiptFile.mockResolvedValue({ ok: true, fileName: "receipt.jpg", summary: null, items: [], skippedBeforeProduction: 0, skippedNonPetrol: 0, skippedUnreadableLitres: 0 });
    const response = await POST(requestWithFile());
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Nothing usable was found on this receipt." });
  });

  it("builds a specific, combined reason message from every applicable skip count", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.parseReceiptFile.mockResolvedValue({
      ok: true, fileName: "receipt.jpg", summary: null, items: [],
      skippedBeforeProduction: 1, skippedNonPetrol: 1, skippedUnreadableLitres: 1,
    });
    const response = await POST(requestWithFile());
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error:
        "Nothing to log from this receipt: dated before 2019, when this bike was made; not petrol - motorcycles run on petrol, so this wasn't logged; the litres couldn't be read clearly enough to log automatically.",
    });
  });
});