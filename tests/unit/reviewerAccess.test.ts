// The app store reviewers' fixed code for the demo account.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ doc: null as Record<string, unknown> | null }));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    item: () => ({
      read: async () => ({ resource: store.doc ?? undefined }),
      delete: async () => {
        if (!store.doc) throw Object.assign(new Error("missing"), { code: 404 });
        store.doc = null;
      },
    }),
    items: {
      upsert: async (doc: Record<string, unknown>) => {
        store.doc = doc;
      },
    },
  }),
}));

import { disableReviewerAccess, enableReviewerAccess, getReviewerAccess, isReviewerCode } from "@/lib/auth/reviewerAccess";

beforeEach(() => {
  store.doc = null;
});

describe("reviewer access", () => {
  it("is off until switched on", async () => {
    expect(await getReviewerAccess()).toBeNull();
    expect(await isReviewerCode("demo@roadverdict.co.uk", "123456")).toBe(false);
  });

  it("gives a 6-digit code once, stores only its hash, and accepts it only for the demo account", async () => {
    const { code } = await enableReviewerAccess();
    expect(code).toMatch(/^\d{6}$/);
    expect(JSON.stringify(store.doc)).not.toContain(code);
    expect(await isReviewerCode("demo@roadverdict.co.uk", code)).toBe(true);
    expect(await isReviewerCode("someone@example.com", code)).toBe(false);
    const wrong = code === "000000" ? "000001" : "000000";
    expect(await isReviewerCode("demo@roadverdict.co.uk", wrong)).toBe(false);
  });

  it("stops working when switched off, and switching on again makes a new code", async () => {
    const first = await enableReviewerAccess();
    await disableReviewerAccess();
    expect(await getReviewerAccess()).toBeNull();
    expect(await isReviewerCode("demo@roadverdict.co.uk", first.code)).toBe(false);
    await disableReviewerAccess(); // already off: no error
    const second = await enableReviewerAccess();
    expect(await isReviewerCode("demo@roadverdict.co.uk", second.code)).toBe(true);
  });
});
