import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ patch: vi.fn(), create: vi.fn(), query: vi.fn() }));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    item: () => ({ patch: mocks.patch }),
    items: { create: mocks.create, query: () => ({ fetchAll: mocks.query }) },
  }),
}));

import { recordFunnelStep, getFunnelDays } from "@/lib/analytics/funnel";
import { classifySource, isInAppBrowser, isLikelyBot, toFunnelSource } from "@/lib/analytics/funnelSource";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.patch.mockResolvedValue({});
  mocks.create.mockResolvedValue({});
});

describe("classifySource", () => {
  it("prefers ?src, then utm_source, then the referring site", () => {
    expect(classifySource({ src: "youtube", utmSource: "facebook", referrer: "https://www.google.com/" })).toBe("youtube");
    expect(classifySource({ utmSource: "meta", referrer: "https://www.google.com/" })).toBe("facebook");
    expect(classifySource({ utmSource: "ig" })).toBe("instagram");
    expect(classifySource({ utmSource: "newsletter" })).toBe("other");
  });

  it("sorts referring sites into buckets", () => {
    expect(classifySource({ referrer: "https://m.youtube.com/" })).toBe("youtube");
    expect(classifySource({ referrer: "https://lm.facebook.com/l.php" })).toBe("facebook");
    expect(classifySource({ referrer: "https://l.instagram.com/" })).toBe("instagram");
    expect(classifySource({ referrer: "https://mail.google.com/" })).toBe("email");
    expect(classifySource({ referrer: "https://www.google.co.uk/" })).toBe("google");
    expect(classifySource({ referrer: "https://www.bing.com/" })).toBe("bing");
    expect(classifySource({ referrer: "https://example.org/x" })).toBe("other");
  });

  it("treats no referrer, our own site, or junk as direct", () => {
    expect(classifySource({})).toBe("direct");
    expect(classifySource({ referrer: "https://roadverdict.co.uk/cars" })).toBe("direct");
    expect(classifySource({ referrer: "not a url" })).toBe("direct");
    expect(classifySource({ src: "made-up" })).toBe("direct");
  });

  it("only accepts known sources", () => {
    expect(toFunnelSource("google")).toBe("google");
    expect(toFunnelSource("<script>")).toBeNull();
    expect(toFunnelSource(3)).toBeNull();
  });
});

describe("browser checks", () => {
  it("spots the Facebook, Instagram and TikTok in-app browsers", () => {
    expect(isInAppBrowser("Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450.0]")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone) Instagram 300.0")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14) musical_ly_2023")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1")).toBe(false);
  });

  it("ignores bots and tools", () => {
    expect(isLikelyBot("Googlebot/2.1")).toBe(true);
    expect(isLikelyBot("curl/8.4")).toBe(true);
    expect(isLikelyBot(null)).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 (iPhone) Mobile Safari/604.1")).toBe(false);
  });
});

describe("recordFunnelStep", () => {
  it("increments the step, its source and its in-app count in one patch", async () => {
    await recordFunnelStep("home", { source: "youtube", inApp: true });
    expect(mocks.patch).toHaveBeenCalledWith([
      { op: "incr", path: "/counts/home", value: 1 },
      { op: "incr", path: "/counts/home__src_youtube", value: 1 },
      { op: "incr", path: "/counts/home__inapp", value: 1 },
    ]);
  });

  it("creates the day's document on the first count", async () => {
    mocks.patch.mockRejectedValueOnce({ code: 404 });
    await recordFunnelStep("first_vehicle");
    const doc = mocks.create.mock.calls[0][0];
    expect(doc).toMatchObject({ pk: "funnel", type: "funnelDay", counts: { first_vehicle: 1 } });
    expect(doc.id).toBe(`funnel::${doc.day}`);
  });

  it("increments instead when another request created the day a moment earlier", async () => {
    mocks.patch.mockRejectedValueOnce({ code: 404 });
    mocks.create.mockRejectedValueOnce({ code: 409 });
    await recordFunnelStep("login", { source: "direct" });
    expect(mocks.patch).toHaveBeenCalledTimes(2);
  });

  it("never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.patch.mockRejectedValue(new Error("cosmos down"));
    await expect(recordFunnelStep("signed_in")).resolves.toBeUndefined();
  });
});

describe("getFunnelDays", () => {
  it("returns every day, newest first, with empty ones filled in", async () => {
    mocks.query.mockResolvedValue({ resources: [] });
    const days = await getFunnelDays(3);
    expect(days).toHaveLength(3);
    expect(days[0].day > days[1].day).toBe(true);
    expect(days.every((d) => Object.keys(d.counts).length === 0)).toBe(true);
  });
});
