import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn(), replace: vi.fn() }));
const mockContainer = {
  item: vi.fn(() => ({ read: mocks.read, replace: mocks.replace })),
  items: { upsert: mocks.upsert },
};
vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import {
  canRunFreeBuyingGuideLookup,
  nextFreeBuyingGuideLookupAt,
  recordBuyingGuideLookupRun,
} from "@/lib/tracker/buyingGuideLookupUsage";
import { BUYING_GUIDE_FREE_LOOKUPS_PER_DAY } from "@/lib/payments/pricing";
import type { UserDoc } from "@/lib/tracker/userDoc";

function makeUser(overrides: Partial<UserDoc> = {}): UserDoc {
  return { id: "a@example.com", pk: "a@example.com", type: "user", email: "a@example.com", createdAt: "2025-01-01T00:00:00.000Z", ...overrides };
}

// Built the same way as the module, so the test can't disagree with it
// about which UK day "today" is.
const ukToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const usage = (count: number, day = ukToday()) => ({ lastRunAt: new Date().toISOString(), day, count });

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
  mocks.replace.mockReset();
});

describe("canRunFreeBuyingGuideLookup", () => {
  it("allows it when the user has never run one before", () => {
    expect(canRunFreeBuyingGuideLookup(makeUser())).toBe(true);
  });

  it("allows it when null (no user doc at all)", () => {
    expect(canRunFreeBuyingGuideLookup(null)).toBe(true);
  });

  it("allows more new plates the same day, up to the daily allowance", () => {
    expect(canRunFreeBuyingGuideLookup(makeUser({ buyingGuideLookupUsage: usage(1) }))).toBe(true);
    expect(canRunFreeBuyingGuideLookup(makeUser({ buyingGuideLookupUsage: usage(BUYING_GUIDE_FREE_LOOKUPS_PER_DAY - 1) }))).toBe(true);
  });

  it("blocks once today's allowance is used", () => {
    expect(canRunFreeBuyingGuideLookup(makeUser({ buyingGuideLookupUsage: usage(BUYING_GUIDE_FREE_LOOKUPS_PER_DAY) }))).toBe(false);
  });

  it("starts afresh on a new day", () => {
    expect(canRunFreeBuyingGuideLookup(makeUser({ buyingGuideLookupUsage: usage(BUYING_GUIDE_FREE_LOOKUPS_PER_DAY, "2020-01-01") }))).toBe(true);
  });

  it("treats an old 30-day record (lastRunAt only, no day) as nothing used today", () => {
    expect(canRunFreeBuyingGuideLookup(makeUser({ buyingGuideLookupUsage: { lastRunAt: new Date().toISOString() } }))).toBe(true);
  });
});

describe("nextFreeBuyingGuideLookupAt", () => {
  it("returns null when there's no usage on record", () => {
    expect(nextFreeBuyingGuideLookupAt(makeUser())).toBeNull();
  });

  it("returns null while today's allowance isn't used up", () => {
    expect(nextFreeBuyingGuideLookupAt(makeUser({ buyingGuideLookupUsage: usage(1) }))).toBeNull();
  });

  it("returns the start of the next UK day once today's allowance is used", () => {
    const next = nextFreeBuyingGuideLookupAt(makeUser({ buyingGuideLookupUsage: usage(BUYING_GUIDE_FREE_LOOKUPS_PER_DAY) }));
    expect(next).not.toBeNull();
    const at = new Date(next!);
    expect(at.getTime()).toBeGreaterThan(Date.now());
    expect(at.getTime() - Date.now()).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    // Midnight in London: the UK day changes exactly there.
    expect(at.toLocaleTimeString("en-GB", { timeZone: "Europe/London" })).toBe("00:00:00");
    expect(at.toLocaleDateString("en-CA", { timeZone: "Europe/London" })).not.toBe(ukToday());
  });
});

describe("recordBuyingGuideLookupRun", () => {
  it("stamps lastRunAt with the current time and writes conditioned on the given etag", async () => {
    mocks.replace.mockResolvedValue({ resource: {} });
    const before = Date.now();
    const result = await recordBuyingGuideLookupRun("a@example.com", "etag-1", makeUser());
    expect(result).toEqual({ recorded: true });
    const [saved, options] = mocks.replace.mock.calls[0];
    expect(new Date((saved as UserDoc).buyingGuideLookupUsage!.lastRunAt).getTime()).toBeGreaterThanOrEqual(before);
    expect((saved as UserDoc).buyingGuideLookupUsage).toMatchObject({ day: ukToday(), count: 1 });
    expect(options).toEqual({ accessCondition: { type: "IfMatch", condition: "etag-1" } });
  });

  it("adds to today's count, and restarts the count on a new day", async () => {
    mocks.replace.mockResolvedValue({ resource: {} });
    await recordBuyingGuideLookupRun("a@example.com", "etag-1", makeUser({ buyingGuideLookupUsage: usage(3) }));
    expect((mocks.replace.mock.calls[0][0] as UserDoc).buyingGuideLookupUsage).toMatchObject({ day: ukToday(), count: 4 });
    await recordBuyingGuideLookupRun("a@example.com", "etag-1", makeUser({ buyingGuideLookupUsage: usage(9, "2020-01-01") }));
    expect((mocks.replace.mock.calls[1][0] as UserDoc).buyingGuideLookupUsage).toMatchObject({ day: ukToday(), count: 1 });
  });

  it("reports alreadyUsed when a concurrent writer already used up today's free lookups", async () => {
    mocks.replace.mockRejectedValueOnce(Object.assign(new Error("conflict"), { code: 412 }));
    mocks.read.mockResolvedValue({
      resource: { ...makeUser(), buyingGuideLookupUsage: usage(BUYING_GUIDE_FREE_LOOKUPS_PER_DAY), _etag: "etag-2" },
    });
    const result = await recordBuyingGuideLookupRun("a@example.com", "etag-1", makeUser());
    expect(result).toEqual({ recorded: false, alreadyUsed: true });
  });
});
