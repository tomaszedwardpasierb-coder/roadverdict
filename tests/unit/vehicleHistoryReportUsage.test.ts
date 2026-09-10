import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
const mockContainer = {
  item: vi.fn(() => ({ read: mocks.read })),
  items: { upsert: mocks.upsert },
};
vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import {
  canRunFreeVehicleHistoryReport,
  nextFreeVehicleHistoryReportAt,
  recordVehicleHistoryReportRun,
} from "@/lib/tracker/vehicleHistoryReportUsage";
import { PRO_FREE_REPORT_COOLDOWN_MS } from "@/lib/payments/pricing";
import type { UserDoc } from "@/lib/tracker/userDoc";

function makeUser(overrides: Partial<UserDoc> = {}): UserDoc {
  return { id: "a@example.com", pk: "a@example.com", type: "user", email: "a@example.com", createdAt: "2025-01-01T00:00:00.000Z", ...overrides };
}

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
});

describe("canRunFreeVehicleHistoryReport", () => {
  it("allows it when the user has never run one before", () => {
    expect(canRunFreeVehicleHistoryReport(makeUser())).toBe(true);
  });

  it("allows it when null (no user doc at all)", () => {
    expect(canRunFreeVehicleHistoryReport(null)).toBe(true);
  });

  it("blocks within the 4-week cooldown", () => {
    const user = makeUser({ vehicleHistoryReportUsage: { lastRunAt: new Date(Date.now() - 1000).toISOString() } });
    expect(canRunFreeVehicleHistoryReport(user)).toBe(false);
  });

  it("allows it again once 4 weeks have passed", () => {
    const user = makeUser({ vehicleHistoryReportUsage: { lastRunAt: new Date(Date.now() - PRO_FREE_REPORT_COOLDOWN_MS - 1000).toISOString() } });
    expect(canRunFreeVehicleHistoryReport(user)).toBe(true);
  });
});

describe("nextFreeVehicleHistoryReportAt", () => {
  it("returns null when there's no usage on record", () => {
    expect(nextFreeVehicleHistoryReportAt(makeUser())).toBeNull();
  });

  it("returns null once the cooldown has already elapsed", () => {
    const user = makeUser({ vehicleHistoryReportUsage: { lastRunAt: new Date(Date.now() - PRO_FREE_REPORT_COOLDOWN_MS - 1000).toISOString() } });
    expect(nextFreeVehicleHistoryReportAt(user)).toBeNull();
  });

  it("returns the date the cooldown ends when still within it", () => {
    const lastRunAt = new Date(Date.now() - 1000).toISOString();
    const user = makeUser({ vehicleHistoryReportUsage: { lastRunAt } });
    const next = nextFreeVehicleHistoryReportAt(user);
    expect(next).not.toBeNull();
    expect(new Date(next!).getTime()).toBe(new Date(lastRunAt).getTime() + PRO_FREE_REPORT_COOLDOWN_MS);
  });
});

describe("recordVehicleHistoryReportRun", () => {
  it("does nothing when the user doc doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await recordVehicleHistoryReportRun("missing@example.com");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stamps lastRunAt with the current time and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: makeUser() });
    const before = Date.now();
    await recordVehicleHistoryReportRun("a@example.com");
    const saved = mocks.upsert.mock.calls[0][0] as UserDoc;
    expect(new Date(saved.vehicleHistoryReportUsage!.lastRunAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});
