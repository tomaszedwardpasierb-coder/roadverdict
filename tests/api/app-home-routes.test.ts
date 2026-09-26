import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getGarage: vi.fn(),
  getHomeData: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/app/homeData", () => ({ getGarage: mocks.getGarage, getHomeData: mocks.getHomeData }));

import { GET as getGarageRoute } from "@/app/api/app/garage/route";
import { GET as getHomeRoute } from "@/app/api/app/home/route";

function homeReq(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/app/home${query}`);
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("GET /api/app/garage", () => {
  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await getGarageRoute();
    expect(res.status).toBe(401);
    expect(mocks.getGarage).not.toHaveBeenCalled();
  });

  it("returns the signed-in account's own garage, never cached", async () => {
    mocks.getGarage.mockResolvedValue({ vehicles: [], defaultVehicle: null });
    const res = await getGarageRoute();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getGarage).toHaveBeenCalledWith("rider@example.com");
  });
});

describe("GET /api/app/home", () => {
  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await getHomeRoute(homeReq("?kind=bike&id=b1"))).status).toBe(401);
    expect(mocks.getHomeData).not.toHaveBeenCalled();
  });

  it("needs a valid kind and an id", async () => {
    expect((await getHomeRoute(homeReq("?kind=boat&id=b1"))).status).toBe(400);
    expect((await getHomeRoute(homeReq("?kind=bike"))).status).toBe(400);
    expect(mocks.getHomeData).not.toHaveBeenCalled();
  });

  it("looks the vehicle up in the signed-in account only", async () => {
    mocks.getHomeData.mockResolvedValue({ ok: true });
    const res = await getHomeRoute(homeReq("?kind=car&id=c1"));
    expect(res.status).toBe(200);
    expect(mocks.getHomeData).toHaveBeenCalledWith("rider@example.com", "car", "c1");
  });

  it("answers 404 for a vehicle not on this account", async () => {
    mocks.getHomeData.mockResolvedValue(null);
    expect((await getHomeRoute(homeReq("?kind=bike&id=not-mine"))).status).toBe(404);
  });
});
