import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  addExtraVehicle: vi.fn(),
  removeExtraVehicle: vi.fn(),
  getBikesForUser: vi.fn(),
  getCarsForUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/payments/extraVehicles", () => ({ addExtraVehicle: mocks.addExtraVehicle, removeExtraVehicle: mocks.removeExtraVehicle }));
vi.mock("@/lib/tracker/bike", () => ({ getBikesForUser: mocks.getBikesForUser, countActiveBikes: (b: unknown[]) => b.length }));
vi.mock("@/lib/tracker/car", () => ({ getCarsForUser: mocks.getCarsForUser, countActiveCars: (c: unknown[]) => c.length }));

import { POST } from "@/app/api/pro/extra-vehicles/route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/pro/extra-vehicles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  mocks.getBikesForUser.mockResolvedValue([{}, {}]);
  mocks.getCarsForUser.mockResolvedValue([{}]);
});

describe("POST /api/pro/extra-vehicles", () => {
  it("needs a signed-in account and a known action", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request({ action: "add" }))).status).toBe(401);
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    expect((await POST(request("nope"))).status).toBe(400);
    expect((await POST(request({ action: "buy" }))).status).toBe(400);
  });

  it("returns the Checkout link for the first extra vehicle", async () => {
    mocks.addExtraVehicle.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/x" });
    const response = await POST(request({ action: "add" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: "https://checkout.stripe.com/x" });
    expect(mocks.addExtraVehicle).toHaveBeenCalledWith("rider@example.com", expect.any(String));
  });

  it("returns the new quantity for a later one", async () => {
    mocks.addExtraVehicle.mockResolvedValue({ ok: true, quantity: 2 });
    await expect((await POST(request({ action: "add" }))).json()).resolves.toEqual({ quantity: 2 });
  });

  it("maps refusals to statuses", async () => {
    mocks.addExtraVehicle.mockResolvedValue({ ok: false, reason: "not_eligible" });
    expect((await POST(request({ action: "add" }))).status).toBe(403);
    mocks.addExtraVehicle.mockResolvedValue({ ok: false, reason: "at_max" });
    expect((await POST(request({ action: "add" }))).status).toBe(409);
    mocks.addExtraVehicle.mockResolvedValue({ ok: false, reason: "failed" });
    expect((await POST(request({ action: "add" }))).status).toBe(502);
  });

  it("removes one, passing the garage's active vehicle count", async () => {
    mocks.removeExtraVehicle.mockResolvedValue({ ok: true, quantity: 0 });
    const response = await POST(request({ action: "remove" }));
    expect(response.status).toBe(200);
    expect(mocks.removeExtraVehicle).toHaveBeenCalledWith("rider@example.com", 3);
  });

  it("refuses removing a slot still in use", async () => {
    mocks.removeExtraVehicle.mockResolvedValue({ ok: false, reason: "too_many_vehicles" });
    const response = await POST(request({ action: "remove" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("remove or transfer a vehicle first");
  });
});
