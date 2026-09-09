// Mirrors share-link-route.test.ts for the car equivalent route.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  createCarShareLink: vi.fn(),
  logImpersonationActivityForCurrentRequest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({ getPrimaryCar: mocks.getPrimaryCar }));
vi.mock("@/lib/tracker/carShareLink", () => ({ createCarShareLink: mocks.createCarShareLink }));
vi.mock("@/lib/admin/impersonation", () => ({
  logImpersonationActivityForCurrentRequest: mocks.logImpersonationActivityForCurrentRequest,
}));

import { POST } from "@/app/api/cars/car-share-link/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-share-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validPayload = { duration: "1month", recipientEmail: "buyer@example.com" };

describe("POST /api/cars/car-share-link", () => {
  const originalAppUrl = process.env.APP_URL;

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1" });
    mocks.createCarShareLink.mockResolvedValue({
      id: "share-token-abc",
      expiresAt: "2026-09-28T00:00:00.000Z",
      recipientEmail: "buyer@example.com",
      askingPrice: undefined,
    });
  });

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  });

  it("rejects unauthenticated requests before reading the body", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(request("not-json"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not signed in." });
  });

  it("rejects malformed JSON for an authenticated request", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request("not-json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
  });

  it("rejects a missing or invalid duration", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ recipientEmail: "buyer@example.com", duration: "1year" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Please choose how long this link should stay valid for.",
    });
    expect(mocks.getPrimaryCar).not.toHaveBeenCalled();
  });

  it("rejects a missing recipient email", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ duration: "1month" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Please enter the email address you're sharing this link with.",
    });
  });

  it("rejects a recipient email with no @", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ duration: "1month", recipientEmail: "not-an-email" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Please enter the email address you're sharing this link with.",
    });
  });

  it("rejects an asking price that isn't a positive, finite number", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ ...validPayload, askingPrice: -50 })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Enter a valid asking price, or leave it blank." });
    expect(mocks.createCarShareLink).not.toHaveBeenCalled();
  });

  it("rejects an asking price above the sanity ceiling", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ ...validPayload, askingPrice: 200001 })));

    expect(response.status).toBe(400);
  });

  it("accepts an asking price exactly at the sanity ceiling", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ ...validPayload, askingPrice: 200000 })));

    expect(response.status).toBe(200);
    expect(mocks.createCarShareLink).toHaveBeenCalledWith(
      "owner@example.com", "car-1", "1month", "buyer@example.com", 200000
    );
  });

  it("returns not found when the account has no car yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No car found for this account." });
  });

  it("creates a valid link with no asking price, which stays genuinely optional", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    process.env.APP_URL = "https://test.roadverdict.co.uk";

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(200);
    expect(mocks.createCarShareLink).toHaveBeenCalledWith(
      "owner@example.com", "car-1", "1month", "buyer@example.com", undefined
    );
    await expect(response.json()).resolves.toEqual({
      url: "https://test.roadverdict.co.uk/car-report/share-token-abc",
      expiresAt: "2026-09-28T00:00:00.000Z",
      recipientEmail: "buyer@example.com",
      askingPrice: null,
    });
    expect(mocks.logImpersonationActivityForCurrentRequest).toHaveBeenCalledWith("carShareLink", "share-token-abc", "create");
  });

  it("falls back to the production domain when APP_URL isn't configured", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    delete process.env.APP_URL;

    const response = await POST(request(JSON.stringify(validPayload)));

    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      url: "https://roadverdict.co.uk/car-report/share-token-abc",
    }));
  });
});
