// IndexNow: only pages that are new or whose date moved are sent, and they're
// recorded as sent only when IndexNow accepts them.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const store = vi.hoisted(() => ({ doc: null as null | { urls: Record<string, string> }, upserts: [] as unknown[] }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    item: () => ({ read: async () => ({ resource: store.doc }) }),
    items: { upsert: async (d: { urls: Record<string, string> }) => { store.upserts.push(d); store.doc = d; } },
  }),
}));

import { changedPages, submitChangedPages, INDEXNOW_KEY, INDEXNOW_ENDPOINT } from "@/lib/seo/indexNow";

const pages = [
  { url: "https://roadverdict.co.uk/", lastModified: "2026-10-04" },
  { url: "https://roadverdict.co.uk/quote-checker", lastModified: "2026-09-27" },
];

beforeEach(() => {
  store.doc = null;
  store.upserts.length = 0;
});

describe("IndexNow", () => {
  it("serves the key file IndexNow checks ownership with", () => {
    expect(readFileSync(`public/${INDEXNOW_KEY}.txt`, "utf8")).toBe(INDEXNOW_KEY);
  });

  it("picks only new pages or pages whose date moved", () => {
    expect(changedPages(pages, { "https://roadverdict.co.uk/": "2026-09-27", "https://roadverdict.co.uk/quote-checker": "2026-09-27" })).toEqual([pages[0]]);
    expect(changedPages(pages, {})).toEqual(pages);
    expect(changedPages(pages, { "https://roadverdict.co.uk/": "2026-10-04", "https://roadverdict.co.uk/quote-checker": "2026-09-27" })).toEqual([]);
  });

  it("sends the changed pages with the key, and remembers them once accepted", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    const r = await submitChangedPages(pages, fetchMock as unknown as typeof fetch);
    expect(r).toEqual({ submitted: pages.map((p) => p.url), status: 202, unchanged: 0 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(JSON.parse(String(init.body))).toEqual({
      host: "roadverdict.co.uk",
      key: INDEXNOW_KEY,
      keyLocation: `https://roadverdict.co.uk/${INDEXNOW_KEY}.txt`,
      urlList: pages.map((p) => p.url),
    });
    expect(store.doc?.urls).toEqual({ "https://roadverdict.co.uk/": "2026-10-04", "https://roadverdict.co.uk/quote-checker": "2026-09-27" });

    // A second run with nothing changed sends nothing.
    const again = vi.fn();
    expect(await submitChangedPages(pages, again as unknown as typeof fetch)).toEqual({ submitted: [], status: null, unchanged: 2 });
    expect(again).not.toHaveBeenCalled();
  });

  it("doesn't record pages as sent when IndexNow refuses them, so the next run retries", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 429 }));
    const r = await submitChangedPages(pages, fetchMock as unknown as typeof fetch);
    expect(r.status).toBe(429);
    expect(store.upserts).toHaveLength(0);
  });
});
