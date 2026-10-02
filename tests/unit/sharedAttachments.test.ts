import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  deleteAttachmentBlobsBestEffort: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ items: { query: (spec: unknown) => ({ fetchAll: () => mocks.query(spec) }) } }),
}));
vi.mock("@/lib/blobStorage", () => ({ deleteAttachmentBlobsBestEffort: mocks.deleteAttachmentBlobsBestEffort }));

import { deleteAttachmentBlobsNoLongerReferenced } from "@/lib/tracker/sharedAttachments";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.deleteAttachmentBlobsBestEffort.mockResolvedValue(undefined);
});

describe("deleteAttachmentBlobsNoLongerReferenced", () => {
  it("does nothing without files", async () => {
    await deleteAttachmentBlobsNoLongerReferenced([]);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.deleteAttachmentBlobsBestEffort).not.toHaveBeenCalled();
  });

  it("keeps a file another owner's copied record still uses, and deletes the rest", async () => {
    mocks.query.mockResolvedValue({ resources: ["shared.jpg"] });
    await deleteAttachmentBlobsNoLongerReferenced(["shared.jpg", "mine.jpg", "mine.jpg"]);
    expect(mocks.query.mock.calls[0][0].parameters).toEqual([{ name: "@names", value: ["shared.jpg", "mine.jpg"] }]);
    expect(mocks.deleteAttachmentBlobsBestEffort).toHaveBeenCalledWith(["mine.jpg"]);
  });

  it("checks large sets in chunks", async () => {
    mocks.query.mockResolvedValue({ resources: [] });
    const names = Array.from({ length: 250 }, (_, i) => `f${i}.jpg`);
    await deleteAttachmentBlobsNoLongerReferenced(names);
    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(mocks.deleteAttachmentBlobsBestEffort).toHaveBeenCalledWith(names);
  });

  it("keeps every file when it can't check", async () => {
    mocks.query.mockRejectedValue(new Error("cosmos down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await deleteAttachmentBlobsNoLongerReferenced(["a.jpg"]);
    expect(mocks.deleteAttachmentBlobsBestEffort).not.toHaveBeenCalled();
  });
});
