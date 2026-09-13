// Place at: tests/unit/atomicUpdate.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ item: () => ({ read: mocks.read, replace: mocks.replace }) }),
}));

import { getDocWithEtag, replaceIfUnchanged } from "@/lib/tracker/atomicUpdate";

interface TestDoc {
  id: string;
  pk: string;
  count: number;
}

function preconditionFailedError() {
  return Object.assign(new Error("PreconditionFailedError"), { code: 412 });
}

describe("getDocWithEtag", () => {
  beforeEach(() => {
    mocks.read.mockReset();
    mocks.replace.mockReset();
  });

  it("returns the doc and its etag when found", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "u1", pk: "u1", count: 1, _etag: "etag-1" } });
    await expect(getDocWithEtag("u1", "u1")).resolves.toEqual({ doc: { id: "u1", pk: "u1", count: 1, _etag: "etag-1" }, etag: "etag-1" });
  });

  it("returns null when the doc doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await expect(getDocWithEtag("missing", "missing")).resolves.toBeNull();
  });
});

describe("replaceIfUnchanged", () => {
  beforeEach(() => {
    mocks.read.mockReset();
    mocks.replace.mockReset();
  });

  const baseDoc: TestDoc = { id: "u1", pk: "u1", count: 1 };
  const applyChange = (doc: TestDoc) => ({ ...doc, count: doc.count + 1 });
  const stillAllowed = (doc: TestDoc) => doc.count < 2;

  it("succeeds on the first attempt when nothing else has changed the doc", async () => {
    mocks.replace.mockResolvedValue({ resource: { ...baseDoc, count: 2 } });
    const result = await replaceIfUnchanged("u1", "u1", "etag-1", baseDoc, applyChange, stillAllowed);
    expect(result).toEqual({ ok: true });
    expect(mocks.replace).toHaveBeenCalledWith({ ...baseDoc, count: 2 }, { accessCondition: { type: "IfMatch", condition: "etag-1" } });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("re-reads and rejects when a concurrent writer already consumed the same thing", async () => {
    mocks.replace.mockRejectedValueOnce(preconditionFailedError());
    // The concurrent writer's own change already pushed count to 2, so
    // stillAllowed(freshDoc) is now false - this attempt genuinely lost.
    mocks.read.mockResolvedValue({ resource: { ...baseDoc, count: 2, _etag: "etag-2" } });

    const result = await replaceIfUnchanged("u1", "u1", "etag-1", baseDoc, applyChange, stillAllowed);

    expect(result).toEqual({ ok: false, reason: "rejected", latest: { ...baseDoc, count: 2, _etag: "etag-2" } });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it("retries once against the fresh etag when the conflict was an unrelated field change", async () => {
    mocks.replace.mockRejectedValueOnce(preconditionFailedError());
    mocks.replace.mockResolvedValueOnce({ resource: {} });
    // Fresh doc still allows the change (count unchanged) - the 412 was
    // just some other concurrent field write, not a competing consumer.
    mocks.read.mockResolvedValue({ resource: { ...baseDoc, count: 1, _etag: "etag-2" } });

    const result = await replaceIfUnchanged("u1", "u1", "etag-1", baseDoc, applyChange, stillAllowed);

    expect(result).toEqual({ ok: true });
    expect(mocks.replace).toHaveBeenCalledTimes(2);
    expect(mocks.replace).toHaveBeenNthCalledWith(2, { ...baseDoc, count: 2, _etag: "etag-2" }, { accessCondition: { type: "IfMatch", condition: "etag-2" } });
  });

  it("returns not_found when the doc has disappeared by the time of the conflict re-read", async () => {
    mocks.replace.mockRejectedValueOnce(preconditionFailedError());
    mocks.read.mockResolvedValue({ resource: undefined });

    const result = await replaceIfUnchanged("u1", "u1", "etag-1", baseDoc, applyChange, stillAllowed);

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("gives up after a second consecutive conflict rather than retrying forever", async () => {
    mocks.replace.mockRejectedValueOnce(preconditionFailedError());
    mocks.read.mockResolvedValue({ resource: { ...baseDoc, count: 1, _etag: "etag-2" } });
    mocks.replace.mockRejectedValueOnce(preconditionFailedError());

    const result = await replaceIfUnchanged("u1", "u1", "etag-1", baseDoc, applyChange, stillAllowed);

    expect(result).toEqual({ ok: false, reason: "rejected", latest: { ...baseDoc, count: 1, _etag: "etag-2" } });
    expect(mocks.replace).toHaveBeenCalledTimes(2);
  });

  it("propagates a non-412 error rather than treating it as a conflict", async () => {
    mocks.replace.mockRejectedValueOnce(new Error("network down"));
    await expect(replaceIfUnchanged("u1", "u1", "etag-1", baseDoc, applyChange, stillAllowed)).rejects.toThrow("network down");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
