// The IndexNow job: cron secret only, and it hands IndexNow the sitemap's pages
// with their dates as plain days.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ submitChangedPages: vi.fn() }));
vi.mock("@/lib/seo/indexNow", () => ({ submitChangedPages: mocks.submitChangedPages }));

import { POST } from "@/app/api/cron/indexnow/route";
import sitemap from "@/app/sitemap";

function req(auth?: string) {
  return new NextRequest("http://localhost/api/cron/indexnow", { method: "POST", headers: auth ? { authorization: auth } : {} });
}

beforeEach(() => {
  mocks.submitChangedPages.mockReset();
  process.env.CRON_SECRET = "s3cret";
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("POST /api/cron/indexnow", () => {
  it("refuses without the cron secret", async () => {
    expect((await POST(req())).status).toBe(401);
    expect(mocks.submitChangedPages).not.toHaveBeenCalled();
  });

  it("passes every sitemap page with its date, and reports what was sent", async () => {
    mocks.submitChangedPages.mockResolvedValue({ submitted: ["https://roadverdict.co.uk/"], status: 202, unchanged: 32 });
    const res = await POST(req("Bearer s3cret"));
    expect(await res.json()).toEqual({ ok: true, submitted: ["https://roadverdict.co.uk/"], status: 202, unchanged: 32 });
    const pages = mocks.submitChangedPages.mock.calls[0][0] as { url: string; lastModified: string }[];
    expect(pages.length).toBeGreaterThanOrEqual(33);
    // The homepage date comes from the sitemap itself, so this doesn't break each time that date moves.
    const home = sitemap().find((e) => e.url === "https://roadverdict.co.uk/")!;
    const homeDay = (home.lastModified instanceof Date ? home.lastModified : new Date(home.lastModified ?? 0)).toISOString().slice(0, 10);
    expect(pages).toContainEqual({ url: "https://roadverdict.co.uk/", lastModified: homeDay });
    expect(pages.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.lastModified))).toBe(true);
  });

  it("answers 500, without throwing, if IndexNow can't be reached", async () => {
    mocks.submitChangedPages.mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(req("Bearer s3cret"))).status).toBe(500);
  });
});
