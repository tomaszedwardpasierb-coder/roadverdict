import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { query: mocks.query },
  }),
}));

import { ownsAttachment } from "@/lib/tracker/attachmentOwnership";

describe("ownsAttachment", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [0] }) });
  });

  it("returns true when the count query finds at least one matching attachment", async () => {
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [2] }) });
    expect(await ownsAttachment("rider@example.com", "abc.jpg")).toBe(true);
  });

  it("returns false when the count query finds nothing", async () => {
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [0] }) });
    expect(await ownsAttachment("rider@example.com", "abc.jpg")).toBe(false);
  });

  it("returns false when the query returns no rows at all", async () => {
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [] }) });
    expect(await ownsAttachment("rider@example.com", "abc.jpg")).toBe(false);
  });

  // The actual performance fix: exactly one query per call, regardless
  // of how many bikes or records the account has - not one fetch per
  // record type per bike (see the file's own comment on why that
  // mattered under this app's 1000 RU/s ceiling).
  it("runs exactly one query, scoped to the caller's own partition, matching the blobName server-side", async () => {
    await ownsAttachment("rider@example.com", "abc.jpg");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [queryObj, options] = mocks.query.mock.calls[0];
    expect(options).toEqual({ partitionKey: "rider@example.com" });
    expect(queryObj.parameters).toEqual(
      expect.arrayContaining([{ name: "@blobName", value: "abc.jpg" }])
    );
  });
});
