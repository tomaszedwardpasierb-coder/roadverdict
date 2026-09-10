import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
const mockContainer = {
  item: vi.fn(() => ({ read: mocks.read })),
  items: { upsert: mocks.upsert },
};
vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import { canRunFreeVdiCheck, nextFreeVdiCheckAt, recordVdiCheckRun, VDI_CHECK_COOLDOWN_MS } from "@/lib/tracker/vdiCheckUsage";
import type { UserDoc } from "@/lib/tracker/userDoc";

function makeUser(overrides: Partial<UserDoc> = {}): UserDoc {
  return { id: "a@example.com", pk: "a@example.com", type: "user", email: "a@example.com", createdAt: "2025-01-01T00:00:00.000Z", ...overrides };
}

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
});

describe("canRunFreeVdiCheck", () => {
  it("allows it when the user has never run one before", () => {
    expect(canRunFreeVdiCheck(makeUser())).toBe(true);
  });

  it("allows it when null (no user doc at all)", () => {
    expect(canRunFreeVdiCheck(null)).toBe(true);
  });

  it("blocks it when the last run was within the last 15 days", () => {
    const user = makeUser({ vdiCheckUsage: { lastRunAt: new Date(Date.now() - 1000).toISOString() } });
    expect(canRunFreeVdiCheck(user)).toBe(false);
  });

  it("allows it again once 15 days have passed", () => {
    const user = makeUser({ vdiCheckUsage: { lastRunAt: new Date(Date.now() - VDI_CHECK_COOLDOWN_MS - 1000).toISOString() } });
    expect(canRunFreeVdiCheck(user)).toBe(true);
  });
});

describe("nextFreeVdiCheckAt", () => {
  it("returns null when there's no usage on record", () => {
    expect(nextFreeVdiCheckAt(makeUser())).toBeNull();
  });

  it("returns null once the cooldown has already elapsed", () => {
    const user = makeUser({ vdiCheckUsage: { lastRunAt: new Date(Date.now() - VDI_CHECK_COOLDOWN_MS - 1000).toISOString() } });
    expect(nextFreeVdiCheckAt(user)).toBeNull();
  });

  it("returns the date the cooldown ends when still within it", () => {
    const lastRunAt = new Date(Date.now() - 1000).toISOString();
    const user = makeUser({ vdiCheckUsage: { lastRunAt } });
    const next = nextFreeVdiCheckAt(user);
    expect(next).not.toBeNull();
    expect(new Date(next!).getTime()).toBe(new Date(lastRunAt).getTime() + VDI_CHECK_COOLDOWN_MS);
  });
});

describe("recordVdiCheckRun", () => {
  it("does nothing when the user doc doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await recordVdiCheckRun("missing@example.com");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stamps lastRunAt with the current time and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: makeUser() });
    const before = Date.now();
    await recordVdiCheckRun("a@example.com");
    const saved = mocks.upsert.mock.calls[0][0] as UserDoc;
    expect(new Date(saved.vdiCheckUsage!.lastRunAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});
