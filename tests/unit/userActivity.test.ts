// Place at: tests/unit/userActivity.test.ts
// "Last seen" bookkeeping: one write per 30 minutes per account, counted
// per UK day, old days dropped, and never able to throw.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ item: () => ({ read: mocks.read }), items: { upsert: mocks.upsert } }),
}));

import { noteActivity, resetActivityThrottle, ukDay } from "@/lib/admin/userActivity";

const T0 = new Date("2026-10-07T09:00:00Z");

beforeEach(() => {
  resetActivityThrottle();
  mocks.read.mockReset();
  mocks.upsert.mockReset();
  mocks.read.mockResolvedValue({ resource: undefined });
  mocks.upsert.mockResolvedValue(undefined);
});

describe("noteActivity", () => {
  it("records the first visit of the day", async () => {
    await noteActivity("rider@example.com", "app", T0);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "activity::rider@example.com",
        pk: "rider@example.com",
        type: "userActivity",
        lastClient: "app",
        lastSeenAt: T0.toISOString(),
        days: { "2026-10-07": 1 },
      })
    );
  });

  it("writes at most once per 30 minutes per account", async () => {
    await noteActivity("rider@example.com", "web", T0);
    await noteActivity("rider@example.com", "web", new Date(T0.getTime() + 10 * 60 * 1000));
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    await noteActivity("someone-else@example.com", "web", T0);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
  });

  it("adds a visit after 30 minutes and drops days older than 60", async () => {
    await noteActivity("rider@example.com", "web", T0);
    mocks.read.mockResolvedValue({ resource: { days: { "2026-10-07": 1, "2026-07-01": 4 } } });
    await noteActivity("rider@example.com", "web", new Date(T0.getTime() + 31 * 60 * 1000));
    expect(mocks.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ days: { "2026-10-07": 2 } }));
  });

  it("never throws when the database fails", async () => {
    mocks.upsert.mockRejectedValue(new Error("cosmos down"));
    await expect(noteActivity("rider@example.com", "web", T0)).resolves.toBeUndefined();
  });

  it("counts days in UK time", () => {
    expect(ukDay(new Date("2026-10-06T23:30:00Z"))).toBe("2026-10-07");
  });
});
