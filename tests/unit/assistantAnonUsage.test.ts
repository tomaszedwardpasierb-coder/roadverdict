import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn(), create: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    item: () => ({ read: mocks.read, replace: mocks.replace }),
    items: { upsert: mocks.upsert, create: mocks.create },
  }),
}));

import { canSendAnonAssistantMessage, generateAnonId, ASSISTANT_ANON_MESSAGE_LIMIT } from "@/lib/tracker/assistantAnonUsage";

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
  mocks.create.mockReset();
  mocks.replace.mockReset();
  mocks.create.mockResolvedValue(undefined);
  mocks.replace.mockResolvedValue({ resource: {} });
});

describe("generateAnonId", () => {
  it("produces a different id on every call", () => {
    expect(generateAnonId()).not.toBe(generateAnonId());
  });

  it("returns a non-trivial random string", () => {
    expect(generateAnonId().length).toBeGreaterThan(10);
  });
});

describe("canSendAnonAssistantMessage", () => {
  it("allows it and creates a fresh count-of-1 doc for both trackers when neither has been seen before", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });

    const allowed = await canSendAnonAssistantMessage("cookie-1", "1.2.3.4");

    expect(allowed).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("increments an existing same-day count", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mocks.read.mockResolvedValue({ resource: { id: "x", pk: "x", type: "assistantAnonUsage", date: today, count: 3, _etag: "etag-1" } });

    const allowed = await canSendAnonAssistantMessage("cookie-1", "1.2.3.4");

    expect(allowed).toBe(true);
    expect(mocks.replace).toHaveBeenCalledWith(expect.objectContaining({ count: 4 }), { accessCondition: { type: "IfMatch", condition: "etag-1" } });
  });

  it("resets the count when the stored date is a previous day", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "x", pk: "x", type: "assistantAnonUsage", date: "2020-01-01", count: 9999, _etag: "etag-1" } });

    const allowed = await canSendAnonAssistantMessage("cookie-1", "1.2.3.4");

    expect(allowed).toBe(true);
    expect(mocks.replace).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }), expect.anything());
  });

  it("blocks once a tracker is already at today's cap, without writing further", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mocks.read.mockResolvedValue({
      resource: { id: "x", pk: "x", type: "assistantAnonUsage", date: today, count: ASSISTANT_ANON_MESSAGE_LIMIT, _etag: "etag-1" },
    });

    const allowed = await canSendAnonAssistantMessage("cookie-1", "1.2.3.4");

    expect(allowed).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("blocks if EITHER the cookie or the IP tracker is at the cap, even if the other is fine", async () => {
    const today = new Date().toISOString().slice(0, 10);
    // First call (cookie key) under the cap, second call (IP key) at the cap.
    mocks.read
      .mockResolvedValueOnce({ resource: { id: "x", pk: "x", type: "assistantAnonUsage", date: today, count: 1, _etag: "etag-1" } })
      .mockResolvedValueOnce({ resource: { id: "y", pk: "y", type: "assistantAnonUsage", date: today, count: ASSISTANT_ANON_MESSAGE_LIMIT, _etag: "etag-2" } });

    const allowed = await canSendAnonAssistantMessage("cookie-1", "1.2.3.4");

    expect(allowed).toBe(false);
  });

  // The actual conflict-retry mechanics (what happens when a concurrent
  // writer already changed the doc) are covered directly and thoroughly
  // in atomicUpdate.test.ts - this file only needs to confirm
  // checkAndIncrement wires the create/replace paths correctly, which
  // the tests above already do.
});
