// Mirrors share-link-send-email-route.test.ts for the car equivalent route.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCarShareLink: vi.fn(),
  getCarById: vi.fn(),
  sendShareLinkEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/carShareLink", () => ({ getCarShareLink: mocks.getCarShareLink }));
vi.mock("@/lib/tracker/car", () => ({ getCarById: mocks.getCarById }));
vi.mock("@/lib/resend", () => ({ sendShareLinkEmail: mocks.sendShareLinkEmail }));

import { POST } from "@/app/api/cars/car-share-link/[token]/send-email/route";

function req(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-share-link/tok/send-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const link = { id: "tok-1", email: "owner@example.com", carId: "car-1", expiresAt: "2026-06-15" };
const car = { make: "Ford", model: "Focus", nickname: "" };

describe("POST /api/cars/car-share-link/[token]/send-email", () => {
  const originalAppUrl = process.env.APP_URL;

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getCarShareLink.mockResolvedValue(link);
    mocks.getCarById.mockResolvedValue(car);
    mocks.sendShareLinkEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(req("{}"), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(req("not-json"), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(400);
  });

  it("rejects a missing or invalid recipient email", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(req(JSON.stringify({ toEmail: "not-an-email" })), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(400);
  });

  it("returns not found for a valid email on a link belonging to someone else", async () => {
    mocks.getSession.mockResolvedValue({ email: "attacker@example.com" });
    const response = await POST(req(JSON.stringify({ toEmail: "buyer@example.com" })), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(404);
    expect(mocks.sendShareLinkEmail).not.toHaveBeenCalled();
  });

  it("returns not found when the link's own car no longer exists", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getCarById.mockResolvedValue(null);
    const response = await POST(req(JSON.stringify({ toEmail: "buyer@example.com" })), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(404);
    expect(mocks.sendShareLinkEmail).not.toHaveBeenCalled();
  });

  it("names the car with make and model when it has no nickname", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(req(JSON.stringify({ toEmail: "buyer@example.com" })), { params: Promise.resolve({ token: "tok-1" }) });
    const [, carName] = mocks.sendShareLinkEmail.mock.calls[0];
    expect(carName).toBe("Ford Focus");
  });

  it("includes the nickname alongside make and model when the car has one", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getCarById.mockResolvedValue({ ...car, nickname: "The Runabout" });
    await POST(req(JSON.stringify({ toEmail: "buyer@example.com" })), { params: Promise.resolve({ token: "tok-1" }) });
    const [, carName] = mocks.sendShareLinkEmail.mock.calls[0];
    expect(carName).toBe("The Runabout (Ford Focus)");
  });

  it("formats a real expiry date into the email", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(req(JSON.stringify({ toEmail: "buyer@example.com" })), { params: Promise.resolve({ token: "tok-1" }) });
    const [, , , expiresLabel] = mocks.sendShareLinkEmail.mock.calls[0];
    expect(expiresLabel).toBe("15 Jun 2026");
  });

  it("labels a link with no expiry date plainly, rather than a formatting error", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getCarShareLink.mockResolvedValue({ ...link, expiresAt: null });
    await POST(req(JSON.stringify({ toEmail: "buyer@example.com" })), { params: Promise.resolve({ token: "tok-1" }) });
    const [, , , expiresLabel] = mocks.sendShareLinkEmail.mock.calls[0];
    expect(expiresLabel).toBe("no expiry date");
  });

  it("builds the car-report link using APP_URL when configured", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    process.env.APP_URL = "https://test.roadverdict.co.uk";
    await POST(req(JSON.stringify({ toEmail: "buyer@example.com" })), { params: Promise.resolve({ token: "tok-1" }) });
    const [, , reportUrl] = mocks.sendShareLinkEmail.mock.calls[0];
    expect(reportUrl).toBe("https://test.roadverdict.co.uk/car-report/tok-1");
  });

  it("falls back to the production domain when APP_URL isn't configured", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    delete process.env.APP_URL;
    await POST(req(JSON.stringify({ toEmail: "buyer@example.com" })), { params: Promise.resolve({ token: "tok-1" }) });
    const [, , reportUrl] = mocks.sendShareLinkEmail.mock.calls[0];
    expect(reportUrl).toBe("https://roadverdict.co.uk/car-report/tok-1");
  });

  it("surfaces the underlying error detail when the email fails to send", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.sendShareLinkEmail.mockRejectedValue(new Error("provider timeout"));

    const response = await POST(req(JSON.stringify({ toEmail: "buyer@example.com" })), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Could not send the email. Please try again.",
      detail: "provider timeout",
    });
  });

  it("sends successfully for a valid, owned link", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(req(JSON.stringify({ toEmail: "buyer@example.com" })), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
