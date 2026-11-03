// One run of a job at a time: the first caller creates the lock and runs,
// a second one arriving while it's held stops, and a lock left behind by a
// run that died is taken over once it has expired.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), read: vi.fn(), replace: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { create: mocks.create },
    item: () => ({ read: mocks.read, replace: mocks.replace, delete: mocks.delete }),
  }),
}));

import { acquireCronLock, releaseCronLock } from "@/lib/admin/cronLock";

const NOW = Date.parse("2026-11-03T09:00:00Z");
const conflict = Object.assign(new Error("exists"), { code: 409 });

beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

describe("acquireCronLock", () => {
  it("runs the first caller, holding the lock for 15 minutes", async () => {
    mocks.create.mockResolvedValue({});
    expect(await acquireCronLock("check-reminders", undefined, NOW)).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cronLock::check-reminders", pk: "system", until: "2026-11-03T09:15:00.000Z" })
    );
  });

  it("stops a second caller while the lock is held", async () => {
    mocks.create.mockRejectedValue(conflict);
    mocks.read.mockResolvedValue({ resource: { until: "2026-11-03T09:14:00.000Z", _etag: "e1" } });
    expect(await acquireCronLock("check-reminders", undefined, NOW)).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("takes over a lock that has expired, unless another run gets there first", async () => {
    mocks.create.mockRejectedValue(conflict);
    mocks.read.mockResolvedValue({ resource: { until: "2026-11-02T09:15:00.000Z", _etag: "e1" } });
    mocks.replace.mockResolvedValue({});
    expect(await acquireCronLock("check-reminders", undefined, NOW)).toBe(true);
    expect(mocks.replace).toHaveBeenCalledWith(expect.anything(), { accessCondition: { type: "IfMatch", condition: "e1" } });

    mocks.replace.mockRejectedValue(Object.assign(new Error("changed"), { code: 412 }));
    expect(await acquireCronLock("check-reminders", undefined, NOW)).toBe(false);
  });

  it("runs anyway when the database can't say, rather than skip the day", async () => {
    mocks.create.mockRejectedValue(Object.assign(new Error("down"), { code: 503 }));
    expect(await acquireCronLock("check-reminders", undefined, NOW)).toBe(true);
  });
});

describe("releaseCronLock", () => {
  it("deletes the lock, and never throws", async () => {
    mocks.delete.mockResolvedValue({});
    await releaseCronLock("check-reminders");
    expect(mocks.delete).toHaveBeenCalled();
    mocks.delete.mockRejectedValue(new Error("gone"));
    await expect(releaseCronLock("check-reminders")).resolves.toBeUndefined();
  });
});
