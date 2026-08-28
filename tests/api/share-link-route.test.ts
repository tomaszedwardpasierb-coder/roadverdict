import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  createShareLink: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({ getPrimaryBike: mocks.getPrimaryBike }));
vi.mock("@/lib/tracker/shareLink", () => ({ createShareLink: mocks.createShareLink }));

import { POST } from "@/app/api/tracker/share-link/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/share-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validPayload = { duration: "1month", recipientEmail: "buyer@example.com" };

describe("POST /api/tracker/share-link", () => {
  const originalAppUrl = process.env.APP_URL;

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1" });
    mocks.createShareLink.mockResolvedValue({
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

  // Worth noting, not fixing: unlike mods/bills/reminders, this route has
  // no isBikeReadOnly check at all - a transferred/read-only account can
  // still reach createShareLink here. Not testing for a behaviour that
  // doesn't exist; just flagging the asymmetry with the other write
  // routes in case it's not intentional.

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
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
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
    expect(mocks.createShareLink).not.toHaveBeenCalled();
  });

  it("rejects an asking price above the sanity ceiling", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ ...validPayload, askingPrice: 200001 })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Enter a valid asking price, or leave it blank." });
  });

  it("accepts an asking price exactly at the sanity ceiling", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ ...validPayload, askingPrice: 200000 })));

    expect(response.status).toBe(200);
    expect(mocks.createShareLink).toHaveBeenCalledWith(
      "owner@example.com", "bike-1", "1month", "buyer@example.com", 200000
    );
  });

  it("returns not found when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No bike found for this account." });
  });

  it("creates a valid link with no asking price, which stays genuinely optional", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    process.env.APP_URL = "https://test.roadverdict.co.uk";

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(200);
    expect(mocks.createShareLink).toHaveBeenCalledWith(
      "owner@example.com", "bike-1", "1month", "buyer@example.com", undefined
    );
    await expect(response.json()).resolves.toEqual({
      url: "https://test.roadverdict.co.uk/report/share-token-abc",
      expiresAt: "2026-09-28T00:00:00.000Z",
      recipientEmail: "buyer@example.com",
      askingPrice: null,
    });
  });

  // No APP_URL configured shouldn't produce a broken link in the email
  // that actually gets sent - falls back to the real production domain.
  it("falls back to the production domain when APP_URL isn't configured", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    delete process.env.APP_URL;

    const response = await POST(request(JSON.stringify(validPayload)));

    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      url: "https://roadverdict.co.uk/report/share-token-abc",
    }));
  });
});