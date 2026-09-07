import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCarsForUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getCarsForUser: mocks.getCarsForUser,
  ACTIVE_CAR_COOKIE: "activeCarId",
}));
// activeVehicle.ts's own cookie constant - not mocked, it's a plain
// string constant with zero dependencies of its own.

import { POST } from "@/app/api/cars/active-car/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/active-car", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/cars/active-car", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getCarsForUser.mockResolvedValue([{ id: "car-1" }, { id: "car-2" }]);
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

  it("requires a carId", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "carId is required." });
  });

  it("returns 404 when the carId doesn't belong to this account, without setting either cookie", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ carId: "someone-elses-car" })));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Car not found on this account." });
    expect(response.cookies.get("activeCarId")).toBeUndefined();
    expect(response.cookies.get("activeVehicleKind")).toBeUndefined();
  });

  it("sets the active-car cookie with the documented attributes on success", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ carId: "car-2" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    const cookie = response.cookies.get("activeCarId");
    expect(cookie).toMatchObject({
      name: "activeCarId",
      value: "car-2",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  });

  // The one thing this route adds beyond the motorcycle equivalent -
  // see activeVehicle.ts for why the shared dashboard needs this.
  it("also sets the activeVehicleKind cookie to 'car' on success", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ carId: "car-2" })));

    const kindCookie = response.cookies.get("activeVehicleKind");
    expect(kindCookie).toMatchObject({
      name: "activeVehicleKind",
      value: "car",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });
});
