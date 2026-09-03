import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: {
      upsert: mocks.upsert,
      query: (queryObj: unknown) => ({ fetchAll: () => mocks.query(queryObj) }),
    },
  }),
}));

import { logGeminiUsage, getGeminiUsageByTask } from "@/lib/tracker/geminiUsageLog";

describe("logGeminiUsage", () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("writes a doc with the given task, model, and success flag", async () => {
    await logGeminiUsage("receiptScan", "gemini-3.5-flash-lite", true);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "geminiUsageLog",
        pk: "geminiUsageLog",
        task: "receiptScan",
        model: "gemini-3.5-flash-lite",
        success: true,
      })
    );
  });

  it("sets a TTL so the log doesn't grow forever", async () => {
    await logGeminiUsage("assistant", "gemini-3.5-flash-lite", false);
    const doc = mocks.upsert.mock.calls[0][0];
    expect(doc.ttl).toBeGreaterThan(0);
  });

  // The same fail-soft guarantee logAssistantQuestion already relies on
  // - a logging failure must never be the reason a real Gemini call (or
  // its caller) fails.
  it("never throws when the underlying write fails", async () => {
    mocks.upsert.mockRejectedValue(new Error("Cosmos unavailable"));
    await expect(logGeminiUsage("assistant", "gemini-3.5-flash-lite", true)).resolves.toBeUndefined();
  });
});

describe("getGeminiUsageByTask", () => {
  it("queries grouped by task and returns results sorted by count, descending", async () => {
    mocks.query.mockResolvedValue({ resources: [{ task: "assistant", count: 3 }, { task: "receiptScan", count: 10 }] });
    const result = await getGeminiUsageByTask();
    expect(result).toEqual([{ task: "receiptScan", count: 10 }, { task: "assistant", count: 3 }]);
    expect(mocks.query).toHaveBeenCalledWith(expect.objectContaining({ query: expect.stringContaining("GROUP BY c.task") }));
  });
});
