import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getToolsScreen: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/app/toolsData", () => ({ getToolsScreen: mocks.getToolsScreen }));

import { GET } from "@/app/api/app/tools/route";

const req = (query: string) => new NextRequest(`http://localhost/api/app/tools${query}`);

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("GET /api/app/tools", () => {
  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(req("?kind=bike&id=b1"))).status).toBe(401);
    expect(mocks.getToolsScreen).not.toHaveBeenCalled();
  });

  it("needs a valid kind and an id", async () => {
    expect((await GET(req("?kind=boat&id=b1"))).status).toBe(400);
    expect((await GET(req("?kind=car"))).status).toBe(400);
    expect(mocks.getToolsScreen).not.toHaveBeenCalled();
  });

  it("answers 404 for a vehicle that isn't this account's", async () => {
    mocks.getToolsScreen.mockResolvedValue(null);
    expect((await GET(req("?kind=bike&id=someone-elses"))).status).toBe(404);
  });

  it("returns the signed-in account's own tools screen, never cached", async () => {
    mocks.getToolsScreen.mockResolvedValue({ kind: "car" });
    const res = await GET(req("?kind=car&id=c1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getToolsScreen).toHaveBeenCalledWith("rider@example.com", "car", "c1");
  });
});
