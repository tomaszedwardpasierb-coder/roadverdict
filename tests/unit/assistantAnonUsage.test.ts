import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    item: () => ({ read: mocks.read }),
    items: { upsert: mocks.upsert },
  }),
}));

import { canSendAnonAssistantMessage, generateAnonId, ASSISTANT_ANON_MESSAGE_LIMIT } from "@/lib/tracker/assistantAnonUsage";

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
  mocks.upsert.mockResolvedValue(undefined);
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
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });

  it("increments an existing same-day count", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mocks.read.mockResolvedValue({ resource: { id: "x", pk: "x", type: "assistantAnonUsage", date: today, count: 3 } });

    const allowed = await canSendAnonAssistantMessage("cookie-1", "1.2.3.4");

    expect(allowed).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ count: 4 }));
  });

  it("resets the count when the stored date is a previous day", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "x", pk: "x", type: "assistantAnonUsage", date: "2020-01-01", count: 9999 } });

    const allowed = await canSendAnonAssistantMessage("cookie-1", "1.2.3.4");

    expect(allowed).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });

  it("blocks once a tracker is already at today's cap, without incrementing further", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mocks.read.mockResolvedValue({ resource: { id: "x", pk: "x", type: "assistantAnonUsage", date: today, count: ASSISTANT_ANON_MESSAGE_LIMIT } });

    const allowed = await canSendAnonAssistantMessage("cookie-1", "1.2.3.4");

    expect(allowed).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("blocks if EITHER the cookie or the IP tracker is at the cap, even if the other is fine", async () => {
    const today = new Date().toISOString().slice(0, 10);
    // First call (cookie key) under the cap, second call (IP key) at the cap.
    mocks.read
      .mockResolvedValueOnce({ resource: { id: "x", pk: "x", type: "assistantAnonUsage", date: today, count: 1 } })
      .mockResolvedValueOnce({ resource: { id: "y", pk: "y", type: "assistantAnonUsage", date: today, count: ASSISTANT_ANON_MESSAGE_LIMIT } });

    const allowed = await canSendAnonAssistantMessage("cookie-1", "1.2.3.4");

    expect(allowed).toBe(false);
  });
});
