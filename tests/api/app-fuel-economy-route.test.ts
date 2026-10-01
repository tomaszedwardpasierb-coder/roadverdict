import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getFuelEconomy: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/app/fuelEconomyData", () => ({ getFuelEconomy: mocks.getFuelEconomy }));

import { GET } from "@/app/api/app/fuel-economy/route";

const req = (query: string) => new NextRequest(`http://localhost/api/app/fuel-economy${query}`);

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("GET /api/app/fuel-economy", () => {
  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(req("?kind=bike&id=b1"))).status).toBe(401);
    expect(mocks.getFuelEconomy).not.toHaveBeenCalled();
  });

  it("needs a valid kind and an id", async () => {
    expect((await GET(req("?kind=boat&id=b1"))).status).toBe(400);
    expect((await GET(req("?kind=car"))).status).toBe(400);
  });

  it("answers 404 for a vehicle that isn't this account's", async () => {
    mocks.getFuelEconomy.mockResolvedValue(null);
    expect((await GET(req("?kind=bike&id=x"))).status).toBe(404);
  });

  it("answers for the account's own vehicle, never cached", async () => {
    mocks.getFuelEconomy.mockResolvedValue({ electric: false });
    const res = await GET(req("?kind=car&id=c1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getFuelEconomy).toHaveBeenCalledWith("rider@example.com", "car", "c1");
  });
});
