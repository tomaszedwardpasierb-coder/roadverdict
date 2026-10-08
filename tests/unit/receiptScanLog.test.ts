// Place at: tests/unit/receiptScanLog.test.ts
//
// The receipt-scan record behind the tester totals: one tiny document per
// successful scan (who, when, how many items - never the photo), written on
// Azure only, never throwing, and counted per account.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { create: mocks.create, query: (spec: unknown) => ({ fetchAll: async () => ({ resources: await mocks.query(spec) }) }) },
  }),
}));

import { getReceiptScanCounts, logReceiptScan } from "@/lib/admin/receiptScanLog";

const NOW = new Date("2026-10-08T12:00:00Z");

beforeEach(() => {
  mocks.create.mockReset();
  mocks.query.mockReset();
  mocks.create.mockResolvedValue(undefined);
  process.env.WEBSITE_SITE_NAME = "roadverdict";
});
afterEach(() => {
  delete process.env.WEBSITE_SITE_NAME;
});

describe("logReceiptScan", () => {
  it("writes one small document in the account's own partition, kept for 90 days", async () => {
    await logReceiptScan("rider@example.com", 3, NOW);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      pk: "rider@example.com",
      type: "receiptScan",
      email: "rider@example.com",
      items: 3,
      createdAt: NOW.toISOString(),
      ttl: 90 * 24 * 60 * 60,
    });
    // Nothing from the receipt itself is stored.
    expect(Object.keys(mocks.create.mock.calls[0][0]).sort()).toEqual(["createdAt", "email", "id", "items", "pk", "ttl", "type"]);
  });

  it("writes nothing off Azure", async () => {
    delete process.env.WEBSITE_SITE_NAME;
    await logReceiptScan("rider@example.com", 1, NOW);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("never throws when the database fails", async () => {
    mocks.create.mockRejectedValue(new Error("cosmos down"));
    await expect(logReceiptScan("rider@example.com", 1, NOW)).resolves.toBeUndefined();
  });
});

describe("getReceiptScanCounts", () => {
  it("counts scans per account and reports the earliest on record", async () => {
    mocks.query.mockResolvedValue([
      { pk: "a@example.com", createdAt: "2026-10-08T09:00:00.000Z" },
      { pk: "a@example.com", createdAt: "2026-10-07T18:00:00.000Z" },
      { pk: "b@example.com", createdAt: "2026-10-08T10:00:00.000Z" },
    ]);
    const counts = await getReceiptScanCounts(new Date("2026-10-01T00:00:00Z"));
    expect(counts?.byEmail.get("a@example.com")).toBe(2);
    expect(counts?.byEmail.get("b@example.com")).toBe(1);
    expect(counts?.firstAt).toBe("2026-10-07T18:00:00.000Z");
  });

  it("has no earliest date when there are no scans", async () => {
    mocks.query.mockResolvedValue([]);
    const counts = await getReceiptScanCounts(new Date("2026-10-01T00:00:00Z"));
    expect(counts?.byEmail.size).toBe(0);
    expect(counts?.firstAt).toBeNull();
  });

  it("returns null when the read fails", async () => {
    mocks.query.mockRejectedValue(new Error("cosmos down"));
    expect(await getReceiptScanCounts(new Date())).toBeNull();
  });
});
