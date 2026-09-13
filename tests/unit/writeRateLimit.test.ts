import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAll: vi.fn(),
  itemsCreate: vi.fn(),
}));

const mockContainer = {
  items: {
    query: vi.fn(() => ({ fetchAll: mocks.fetchAll })),
    create: mocks.itemsCreate,
  },
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import { checkAndRecordWrite } from "@/lib/tracker/writeRateLimit";

function resetMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mockContainer.items.query.mockClear();
}

describe("checkAndRecordWrite", () => {
  beforeEach(resetMocks);

  it("allows the write and records the attempt when under budget", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: new Array(5).fill({ id: "x" }) });
    mocks.itemsCreate.mockResolvedValue(undefined);

    const allowed = await checkAndRecordWrite("owner@example.com");

    expect(allowed).toBe(true);
    expect(mocks.itemsCreate).toHaveBeenCalledTimes(1);
    const [doc] = mocks.itemsCreate.mock.calls[0];
    expect(doc).toMatchObject({ pk: "owner@example.com", type: "trackerWriteAttempt" });
    expect(doc.id).toContain("tracker-write-attempt:");
  });

  it("refuses and records nothing once the account is at the cap", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: new Array(120).fill({ id: "x" }) });

    const allowed = await checkAndRecordWrite("owner@example.com");

    expect(allowed).toBe(false);
    expect(mocks.itemsCreate).not.toHaveBeenCalled();
  });

  it("scopes the count query to the calling account's own partition", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    mocks.itemsCreate.mockResolvedValue(undefined);

    await checkAndRecordWrite("owner@example.com");

    const [, options] = mockContainer.items.query.mock.calls[0] as any[];
    expect(options).toEqual({ partitionKey: "owner@example.com" });
  });
});
