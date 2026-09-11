import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
const mockContainer = {
  item: vi.fn(() => ({ read: mocks.read })),
  items: { upsert: mocks.upsert },
};
vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import {
  canRunValuationCheck,
  nextValuationCheckAt,
  recordValuationCheckRun,
  VALUATION_CHECK_COOLDOWN_MS_FREE,
  VALUATION_CHECK_COOLDOWN_MS_PRO,
} from "@/lib/tracker/valuationCheckUsage";
import type { UserDoc } from "@/lib/tracker/userDoc";

function makeUser(overrides: Partial<UserDoc> = {}): UserDoc {
  return { id: "a@example.com", pk: "a@example.com", type: "user", email: "a@example.com", createdAt: "2025-01-01T00:00:00.000Z", ...overrides };
}

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
});

describe("canRunValuationCheck", () => {
  it("allows it when the user has never run one before", () => {
    expect(canRunValuationCheck(makeUser(), false)).toBe(true);
  });

  it("allows it when null (no user doc at all)", () => {
    expect(canRunValuationCheck(null, false)).toBe(true);
  });

  it("blocks a free account within the 7-day cooldown", () => {
    const user = makeUser({ valuationCheckUsage: { lastRunAt: new Date(Date.now() - 1000).toISOString() } });
    expect(canRunValuationCheck(user, false)).toBe(false);
  });

  it("allows a free account again once 7 days have passed", () => {
    const user = makeUser({ valuationCheckUsage: { lastRunAt: new Date(Date.now() - VALUATION_CHECK_COOLDOWN_MS_FREE - 1000).toISOString() } });
    expect(canRunValuationCheck(user, false)).toBe(true);
  });

  it("blocks a Pro account within the same cooldown as Free", () => {
    const user = makeUser({ valuationCheckUsage: { lastRunAt: new Date(Date.now() - 1000).toISOString() } });
    expect(canRunValuationCheck(user, true)).toBe(false);
  });

  // Pro's cooldown used to be a separate, much shorter 24h window - at
  // £0.20/call that alone worked out to more than Pro's entire monthly
  // subscription price. Matched to Free's 7-day cooldown instead (see
  // VALUATION_CHECK_COOLDOWN_MS_PRO's own comment) - this pins that both
  // plans now share the exact same window, not a Pro-specific shortcut.
  it("gives Pro the exact same cooldown as Free, not a shorter one", () => {
    expect(VALUATION_CHECK_COOLDOWN_MS_PRO).toBe(VALUATION_CHECK_COOLDOWN_MS_FREE);
    const lastRunAt = new Date(Date.now() - VALUATION_CHECK_COOLDOWN_MS_FREE - 1000).toISOString();
    const user = makeUser({ valuationCheckUsage: { lastRunAt } });
    expect(canRunValuationCheck(user, true)).toBe(true);
    expect(canRunValuationCheck(user, false)).toBe(true);
  });
});

describe("nextValuationCheckAt", () => {
  it("returns null when there's no usage on record", () => {
    expect(nextValuationCheckAt(makeUser(), false)).toBeNull();
  });

  it("returns null once the free cooldown has already elapsed", () => {
    const user = makeUser({ valuationCheckUsage: { lastRunAt: new Date(Date.now() - VALUATION_CHECK_COOLDOWN_MS_FREE - 1000).toISOString() } });
    expect(nextValuationCheckAt(user, false)).toBeNull();
  });

  it("returns the date the free cooldown ends when still within it", () => {
    const lastRunAt = new Date(Date.now() - 1000).toISOString();
    const user = makeUser({ valuationCheckUsage: { lastRunAt } });
    const next = nextValuationCheckAt(user, false);
    expect(next).not.toBeNull();
    expect(new Date(next!).getTime()).toBe(new Date(lastRunAt).getTime() + VALUATION_CHECK_COOLDOWN_MS_FREE);
  });

  it("returns the same cooldown end date when isPro is true", () => {
    const lastRunAt = new Date(Date.now() - 1000).toISOString();
    const user = makeUser({ valuationCheckUsage: { lastRunAt } });
    const next = nextValuationCheckAt(user, true);
    expect(new Date(next!).getTime()).toBe(new Date(lastRunAt).getTime() + VALUATION_CHECK_COOLDOWN_MS_PRO);
  });
});

describe("recordValuationCheckRun", () => {
  it("does nothing when the user doc doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await recordValuationCheckRun("missing@example.com");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stamps lastRunAt with the current time and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: makeUser() });
    const before = Date.now();
    await recordValuationCheckRun("a@example.com");
    const saved = mocks.upsert.mock.calls[0][0] as UserDoc;
    expect(new Date(saved.valuationCheckUsage!.lastRunAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});
