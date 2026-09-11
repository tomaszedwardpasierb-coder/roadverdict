import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
const mockContainer = {
  item: vi.fn(() => ({ read: mocks.read })),
  items: { upsert: mocks.upsert },
};
vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import { canRunVehicleLookup, recordVehicleLookupRun, VEHICLE_LOOKUP_COOLDOWN_MS } from "@/lib/tracker/vehicleLookupCooldown";
import type { UserDoc } from "@/lib/tracker/userDoc";

function makeUser(overrides: Partial<UserDoc> = {}): UserDoc {
  return { id: "a@example.com", pk: "a@example.com", type: "user", email: "a@example.com", createdAt: "2025-01-01T00:00:00.000Z", ...overrides };
}

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
});

describe("canRunVehicleLookup", () => {
  it("allows it when the user has never run one before", () => {
    expect(canRunVehicleLookup(makeUser())).toBe(true);
  });

  it("allows it when null (no user doc at all)", () => {
    expect(canRunVehicleLookup(null)).toBe(true);
  });

  it("blocks within the cooldown", () => {
    const user = makeUser({ vehicleLookupUsage: { lastRunAt: new Date(Date.now() - 1000).toISOString() } });
    expect(canRunVehicleLookup(user)).toBe(false);
  });

  it("allows it again once the cooldown has elapsed", () => {
    const user = makeUser({ vehicleLookupUsage: { lastRunAt: new Date(Date.now() - VEHICLE_LOOKUP_COOLDOWN_MS - 1000).toISOString() } });
    expect(canRunVehicleLookup(user)).toBe(true);
  });
});

describe("recordVehicleLookupRun", () => {
  it("does nothing when the user doc doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await recordVehicleLookupRun("missing@example.com");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stamps lastRunAt with the current time and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: makeUser() });
    const before = Date.now();
    await recordVehicleLookupRun("a@example.com");
    const saved = mocks.upsert.mock.calls[0][0] as UserDoc;
    expect(new Date(saved.vehicleLookupUsage!.lastRunAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});
