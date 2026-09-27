import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getReports: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/app/reportsData", () => ({ getReports: mocks.getReports }));

import { GET } from "@/app/api/app/reports/route";

const req = (query: string) => new NextRequest(`http://localhost/api/app/reports${query}`);

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("GET /api/app/reports", () => {
  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(req("?kind=bike&id=b1"))).status).toBe(401);
    expect(mocks.getReports).not.toHaveBeenCalled();
  });

  it("needs a valid kind, an id and one of the web charts' ranges", async () => {
    expect((await GET(req("?kind=boat&id=b1"))).status).toBe(400);
    expect((await GET(req("?kind=bike"))).status).toBe(400);
    expect((await GET(req("?kind=bike&id=b1&range=2w"))).status).toBe(400);
    expect(mocks.getReports).not.toHaveBeenCalled();
  });

  it("answers 404 for a vehicle that isn't this account's", async () => {
    mocks.getReports.mockResolvedValue(null);
    expect((await GET(req("?kind=bike&id=someone-elses"))).status).toBe(404);
  });

  it("covers all time unless a range is asked for, and is never cached", async () => {
    mocks.getReports.mockResolvedValue({ isPro: false });
    const res = await GET(req("?kind=car&id=c1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getReports).toHaveBeenCalledWith("rider@example.com", "car", "c1", "all");
    await GET(req("?kind=car&id=c1&range=ytd"));
    expect(mocks.getReports).toHaveBeenLastCalledWith("rider@example.com", "car", "c1", "ytd");
  });
});
