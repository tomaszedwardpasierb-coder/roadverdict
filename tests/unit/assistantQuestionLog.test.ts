import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  fetchAll: vi.fn(),
  deleteItem: vi.fn(),
}));

const mockContainer = {
  items: {
    upsert: mocks.upsert,
    query: vi.fn(() => ({ fetchAll: mocks.fetchAll })),
  },
  item: vi.fn(() => ({ delete: mocks.deleteItem })),
};
vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import {
  logAssistantQuestion,
  getAllAssistantQuestions,
  groupSimilarQuestions,
  deleteAssistantQuestion,
  deleteAssistantQuestions,
  type AssistantQuestionLogDoc,
} from "@/lib/tracker/assistantQuestionLog";

describe("logAssistantQuestion", () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("logs a signed-in question with the email included", async () => {
    await logAssistantQuestion("When is my MOT due?", true, false, "rider@example.com");
    const doc = mocks.upsert.mock.calls[0][0];
    expect(doc).toMatchObject({
      pk: "assistant-question-log",
      type: "assistantQuestion",
      question: "When is my MOT due?",
      signedIn: true,
      hadError: false,
      email: "rider@example.com",
    });
  });

  // Never a placeholder standing in for "unknown" - the field is
  // genuinely absent for an anonymous visitor, not present-but-empty.
  it("omits the email field entirely for an anonymous question, rather than an empty string or undefined value", async () => {
    await logAssistantQuestion("How much is an MOT?", false, false);
    const doc = mocks.upsert.mock.calls[0][0];
    expect("email" in doc).toBe(false);
  });

  it("truncates an overlong question to 500 characters", async () => {
    await logAssistantQuestion("x".repeat(600), false, false);
    const doc = mocks.upsert.mock.calls[0][0];
    expect(doc.question).toHaveLength(500);
  });

  // The documented guarantee: a logging failure must never propagate
  // and interrupt the actual chat response.
  it("never throws, even if the underlying Cosmos write fails", async () => {
    mocks.upsert.mockRejectedValue(new Error("write failed"));
    await expect(logAssistantQuestion("test", false, false)).resolves.toBeUndefined();
  });
});

describe("getAllAssistantQuestions", () => {
  it("fetches from the fixed shared partition, not a per-user one", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [{ id: "q1" }] });
    const result = await getAllAssistantQuestions();
    expect(mockContainer.items.query).toHaveBeenCalledWith(
      expect.objectContaining({ parameters: [{ name: "@type", value: "assistantQuestion" }] }),
      { partitionKey: "assistant-question-log" }
    );
    expect(result).toEqual([{ id: "q1" }]);
  });
});

describe("deleteAssistantQuestion", () => {
  it("deletes using the fixed partition key as a direct point-delete", async () => {
    mocks.deleteItem.mockResolvedValue(undefined);
    await deleteAssistantQuestion("q1");
    expect(mockContainer.item).toHaveBeenCalledWith("q1", "assistant-question-log");
  });
});

describe("deleteAssistantQuestions", () => {
  beforeEach(() => mocks.deleteItem.mockReset());

  it("point-deletes every given id using the fixed partition key", async () => {
    mocks.deleteItem.mockResolvedValue(undefined);
    const count = await deleteAssistantQuestions(["q1", "q2", "q3"]);
    expect(mockContainer.item).toHaveBeenCalledWith("q1", "assistant-question-log");
    expect(mockContainer.item).toHaveBeenCalledWith("q2", "assistant-question-log");
    expect(mockContainer.item).toHaveBeenCalledWith("q3", "assistant-question-log");
    expect(count).toBe(3);
  });

  it("is best-effort - one failed delete doesn't stop the rest, and only counts real successes", async () => {
    mocks.deleteItem
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const count = await deleteAssistantQuestions(["q1", "q2", "q3"]);
    expect(count).toBe(2);
  });

  it("returns 0 for an empty id list", async () => {
    const count = await deleteAssistantQuestions([]);
    expect(count).toBe(0);
  });
});

function q(question: string): AssistantQuestionLogDoc {
  return { id: "x", pk: "assistant-question-log", type: "assistantQuestion", question, askedAt: "2025-01-01", signedIn: false, hadError: false };
}

describe("groupSimilarQuestions", () => {
  it("groups exact-normalized-match questions and counts them", () => {
    const result = groupSimilarQuestions([q("When is my MOT due?"), q("when is my mot due?"), q("Something else")]);
    expect(result).toEqual(expect.arrayContaining([{ text: "when is my mot due", count: 2 }]));
  });

  it("normalises whitespace and trailing punctuation before grouping", () => {
    const result = groupSimilarQuestions([q("How much is a service???"), q("  how   much is a service  ")]);
    expect(result.find((r) => r.text === "how much is a service")?.count).toBe(2);
  });

  it("sorts by count descending", () => {
    const result = groupSimilarQuestions([q("rare"), q("common"), q("common")]);
    expect(result[0]).toEqual({ text: "common", count: 2 });
  });

  it("respects the topN limit", () => {
    const questions = Array.from({ length: 20 }, (_, i) => q(`question ${i}`));
    expect(groupSimilarQuestions(questions, 5)).toHaveLength(5);
  });

  it("skips a genuinely empty or whitespace-only question", () => {
    const result = groupSimilarQuestions([q("   "), q("real question")]);
    expect(result).toEqual([{ text: "real question", count: 1 }]);
  });

  // The documented limitation: this is exact-match on normalized text,
  // not true semantic clustering - two questions meaning the same
  // thing but phrased differently must NOT be merged.
  it("does not merge questions that mean the same thing but are phrased differently", () => {
    const result = groupSimilarQuestions([q("when's my MOT due"), q("MOT due date")]);
    expect(result).toHaveLength(2);
  });
});