import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getShareLinks: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/app/shareLinksData", () => ({ getShareLinks: mocks.getShareLinks }));

import { GET } from "@/app/api/app/share-links/route";

const req = (query: string) => new NextRequest(`http://localhost/api/app/share-links${query}`);

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("GET /api/app/share-links", () => {
  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(req("?kind=bike&id=b1"))).status).toBe(401);
    expect(mocks.getShareLinks).not.toHaveBeenCalled();
  });

  it("needs a valid kind and an id", async () => {
    expect((await GET(req("?kind=boat&id=b1"))).status).toBe(400);
    expect((await GET(req("?kind=car"))).status).toBe(400);
    expect(mocks.getShareLinks).not.toHaveBeenCalled();
  });

  it("answers 404 for a vehicle that isn't this account's", async () => {
    mocks.getShareLinks.mockResolvedValue(null);
    expect((await GET(req("?kind=bike&id=someone-elses"))).status).toBe(404);
  });

  it("answers for the signed-in account's vehicle, never cached", async () => {
    mocks.getShareLinks.mockResolvedValue({ links: [], requests: [] });
    const res = await GET(req("?kind=car&id=c1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ links: [], requests: [] });
    expect(mocks.getShareLinks).toHaveBeenCalledWith("rider@example.com", "car", "c1");
  });
});
