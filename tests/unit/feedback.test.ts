import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  fetchAll: vi.fn(),
  readItem: vi.fn(),
  replaceItem: vi.fn(),
}));

const mockContainer = {
  items: {
    create: mocks.create,
    query: vi.fn(() => ({ fetchAll: mocks.fetchAll })),
  },
  item: vi.fn(() => ({ read: mocks.readItem, replace: mocks.replaceItem })),
};
vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import { createFeedback, getAllFeedback, updateFeedbackStatus, type FeedbackDoc } from "@/lib/tracker/feedback";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe("createFeedback", () => {
  it("writes a new-status feedback doc to the fixed shared partition, not a per-user one", async () => {
    mocks.create.mockResolvedValue(undefined);
    const doc = await createFeedback("rider@example.com", "bug", "The chart is blank", undefined, "settings");

    expect(doc).toMatchObject({
      pk: "feedback-log",
      type: "feedback",
      feedbackType: "bug",
      message: "The chart is blank",
      email: "rider@example.com",
      status: "new",
      source: "settings",
    });
    expect(mocks.create).toHaveBeenCalledWith(doc);
  });

  it("omits the attachments field entirely when none are given, rather than an empty array", async () => {
    mocks.create.mockResolvedValue(undefined);
    const doc = await createFeedback("rider@example.com", "feature", "Add dark mode", undefined, "settings");
    expect("attachments" in doc).toBe(false);
  });

  it("includes attachments when given (bug reports only, in practice)", async () => {
    mocks.create.mockResolvedValue(undefined);
    const attachments = [{ blobName: "b1", fileName: "screenshot.png", fileType: "image/png" as const, uploadedAt: "2026-01-01" }];
    const doc = await createFeedback("rider@example.com", "bug", "Broken", attachments, "assistant");
    expect(doc.attachments).toEqual(attachments);
    expect(doc.source).toBe("assistant");
  });

  it("propagates a Cosmos write failure - this is the primary action, not best-effort logging", async () => {
    mocks.create.mockRejectedValue(new Error("write failed"));
    await expect(createFeedback("rider@example.com", "bug", "x", undefined, "settings")).rejects.toThrow("write failed");
  });
});

describe("getAllFeedback", () => {
  it("fetches from the fixed shared partition, newest first", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [{ id: "f1" }] });
    const result = await getAllFeedback();
    expect(mockContainer.items.query).toHaveBeenCalledWith(
      expect.objectContaining({ parameters: [{ name: "@type", value: "feedback" }] }),
      { partitionKey: "feedback-log" }
    );
    expect(result).toEqual([{ id: "f1" }]);
  });
});

describe("updateFeedbackStatus", () => {
  const existing: FeedbackDoc = {
    id: "f1", pk: "feedback-log", type: "feedback", feedbackType: "bug", message: "x",
    email: "rider@example.com", submittedAt: "2026-01-01", status: "new", source: "settings",
  };

  it("reads the existing doc and replaces it with only the status field changed", async () => {
    mocks.readItem.mockResolvedValue({ resource: existing });
    mocks.replaceItem.mockResolvedValue(undefined);

    await updateFeedbackStatus("f1", "resolved");

    expect(mockContainer.item).toHaveBeenCalledWith("f1", "feedback-log");
    expect(mocks.replaceItem).toHaveBeenCalledWith({ ...existing, status: "resolved" });
  });

  it("throws a clear error rather than silently no-op-ing when the item doesn't exist", async () => {
    mocks.readItem.mockResolvedValue({ resource: undefined });
    await expect(updateFeedbackStatus("missing", "resolved")).rejects.toThrow("Feedback item missing not found.");
    expect(mocks.replaceItem).not.toHaveBeenCalled();
  });
});
