import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  setOriginalRegistration: vi.fn(),
  isBikeReadOnly: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  setOriginalRegistration: mocks.setOriginalRegistration,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));

import { POST } from "@/app/api/tracker/bike/set-original-registration/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/bike/set-original-registration", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tracker/bike/set-original-registration", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1" });
    mocks.isBikeReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("{}"));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects an empty or whitespace-only registration", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ registration: "   " })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Registration number is required." });
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ registration: "AB12 CDE" })));
    expect(response.status).toBe(404);
    expect(mocks.setOriginalRegistration).not.toHaveBeenCalled();
  });

  it("blocks setting a registration on a transferred (read-only) bike", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify({ registration: "AB12 CDE" })));
    expect(response.status).toBe(403);
    expect(mocks.setOriginalRegistration).not.toHaveBeenCalled();
  });

  it("trims and uppercases the registration before setting it", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.setOriginalRegistration.mockResolvedValue({ ok: true, bike: { id: "bike-1", originalRegistration: "AB12 CDE" } });

    await POST(request(JSON.stringify({ registration: "  ab12 cde  " })));

    expect(mocks.setOriginalRegistration).toHaveBeenCalledWith("owner@example.com", "bike-1", "AB12 CDE");
  });

  // Defense-in-depth guarantee mirrored from setOriginalRegistration
  // itself: this field can only ever be set once, never edited.
  it("responds 409 (not 400/500) when the registration is already set", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.setOriginalRegistration.mockResolvedValue({ ok: false, reason: "already_set" });

    const response = await POST(request(JSON.stringify({ registration: "AB12 CDE" })));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This bike already has a registration on record and it can't be changed here.",
    });
  });

  it("responds 404 when the underlying update reports not_found (e.g. deleted mid-request)", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.setOriginalRegistration.mockResolvedValue({ ok: false, reason: "not_found" });

    const response = await POST(request(JSON.stringify({ registration: "AB12 CDE" })));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Bike not found." });
  });

  it("returns the updated bike on success", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.setOriginalRegistration.mockResolvedValue({ ok: true, bike: { id: "bike-1", originalRegistration: "AB12 CDE" } });

    const response = await POST(request(JSON.stringify({ registration: "AB12 CDE" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bike: { id: "bike-1", originalRegistration: "AB12 CDE" } });
  });
});