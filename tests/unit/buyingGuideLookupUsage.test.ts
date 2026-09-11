import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
const mockContainer = {
  item: vi.fn(() => ({ read: mocks.read })),
  items: { upsert: mocks.upsert },
};
vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import {
  canRunFreeBuyingGuideLookup,
  nextFreeBuyingGuideLookupAt,
  recordBuyingGuideLookupRun,
} from "@/lib/tracker/buyingGuideLookupUsage";
import { BUYING_GUIDE_LOOKUP_COOLDOWN_MS } from "@/lib/payments/pricing";
import type { UserDoc } from "@/lib/tracker/userDoc";

function makeUser(overrides: Partial<UserDoc> = {}): UserDoc {
  return { id: "a@example.com", pk: "a@example.com", type: "user", email: "a@example.com", createdAt: "2025-01-01T00:00:00.000Z", ...overrides };
}

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
});

describe("canRunFreeBuyingGuideLookup", () => {
  it("allows it when the user has never run one before", () => {
    expect(canRunFreeBuyingGuideLookup(makeUser())).toBe(true);
  });

  it("allows it when null (no user doc at all)", () => {
    expect(canRunFreeBuyingGuideLookup(null)).toBe(true);
  });

  it("blocks within the 4-week cooldown", () => {
    const user = makeUser({ buyingGuideLookupUsage: { lastRunAt: new Date(Date.now() - 1000).toISOString() } });
    expect(canRunFreeBuyingGuideLookup(user)).toBe(false);
  });

  it("allows it again once 4 weeks have passed", () => {
    const user = makeUser({ buyingGuideLookupUsage: { lastRunAt: new Date(Date.now() - BUYING_GUIDE_LOOKUP_COOLDOWN_MS - 1000).toISOString() } });
    expect(canRunFreeBuyingGuideLookup(user)).toBe(true);
  });
});

describe("nextFreeBuyingGuideLookupAt", () => {
  it("returns null when there's no usage on record", () => {
    expect(nextFreeBuyingGuideLookupAt(makeUser())).toBeNull();
  });

  it("returns null once the cooldown has already elapsed", () => {
    const user = makeUser({ buyingGuideLookupUsage: { lastRunAt: new Date(Date.now() - BUYING_GUIDE_LOOKUP_COOLDOWN_MS - 1000).toISOString() } });
    expect(nextFreeBuyingGuideLookupAt(user)).toBeNull();
  });

  it("returns the date the cooldown ends when still within it", () => {
    const lastRunAt = new Date(Date.now() - 1000).toISOString();
    const user = makeUser({ buyingGuideLookupUsage: { lastRunAt } });
    const next = nextFreeBuyingGuideLookupAt(user);
    expect(next).not.toBeNull();
    expect(new Date(next!).getTime()).toBe(new Date(lastRunAt).getTime() + BUYING_GUIDE_LOOKUP_COOLDOWN_MS);
  });
});

describe("recordBuyingGuideLookupRun", () => {
  it("does nothing when the user doc doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await recordBuyingGuideLookupRun("missing@example.com");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stamps lastRunAt with the current time and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: makeUser() });
    const before = Date.now();
    await recordBuyingGuideLookupRun("a@example.com");
    const saved = mocks.upsert.mock.calls[0][0] as UserDoc;
    expect(new Date(saved.buyingGuideLookupUsage!.lastRunAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});
