// Who keeps using RoadVerdict after signing up - the weekly "added
// something real" number and the new-account cohorts, from plain rows.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cosmos", () => ({ getContainer: vi.fn() }));

import { buildActivationStats, isRealRecord, weekStartOf, activationWindowStart, type RecordRow } from "@/lib/analytics/activation";

// Friday 2 October 2026, midday UK time.
const now = new Date("2026-10-02T11:00:00.000Z");
const record = (pk: string, createdAt: string, extra: Partial<RecordRow> = {}): RecordRow => ({ pk, createdAt, type: "serviceRecord", ...extra });

describe("isRealRecord", () => {
  it("counts what an owner logged, not imported MOT tests, automatic instalments or the demo account", () => {
    expect(isRealRecord(record("a@example.com", "2026-10-01T10:00:00.000Z"))).toBe(true);
    expect(isRealRecord(record("a@example.com", "x", { type: "bill", billType: "mot-test", cost: 0 }))).toBe(false);
    expect(isRealRecord(record("a@example.com", "x", { type: "carBill", billType: "mot-test", cost: 54.85 }))).toBe(true);
    expect(isRealRecord(record("a@example.com", "x", { type: "bill", billType: "insurance", source: "auto" }))).toBe(false);
    expect(isRealRecord(record("demo@roadverdict.co.uk", "x"))).toBe(false);
  });
});

describe("weekStartOf", () => {
  it("starts UK weeks on Monday, in UK time", () => {
    expect(weekStartOf(now)).toBe("2026-09-28");
    // 00:30 on Monday 28 September in London is still Sunday in UTC.
    expect(weekStartOf(new Date("2026-09-27T23:30:00.000Z"))).toBe("2026-09-28");
    expect(weekStartOf(new Date("2026-09-27T22:30:00.000Z"))).toBe("2026-09-21");
  });

  it("fetches from the Sunday before the oldest week shown", () => {
    // Eight weeks back from the week of 28 September starts 10 August.
    expect(activationWindowStart(now)).toBe("2026-08-09T00:00:00.000Z");
  });
});

describe("buildActivationStats", () => {
  it("counts each person once per week they added something real, newest week first", () => {
    const stats = buildActivationStats({
      now,
      accounts: [],
      vehicleOwners: new Set(),
      records: [
        record("a@example.com", "2026-09-29T08:00:00.000Z"),
        record("a@example.com", "2026-10-01T08:00:00.000Z", { type: "fuelLog" }),
        record("b@example.com", "2026-10-02T08:00:00.000Z", { type: "carMod" }),
        record("c@example.com", "2026-09-30T08:00:00.000Z", { type: "bill", billType: "mot-test", cost: 0 }),
        record("a@example.com", "2026-09-22T08:00:00.000Z"),
      ],
    });
    expect(stats.weeks).toHaveLength(8);
    expect(stats.weeks[0]).toEqual({ weekStart: "2026-09-28", people: 2 });
    expect(stats.weeks[1]).toEqual({ weekStart: "2026-09-21", people: 1 });
    expect(stats.weeks[7].weekStart).toBe("2026-08-10");
  });

  it("follows each week's new accounts: a vehicle, a first record, and something again in week 2", () => {
    const stats = buildActivationStats({
      now,
      accounts: [
        { email: "keen@example.com", createdAt: "2026-09-08T09:00:00.000Z" },
        { email: "once@example.com", createdAt: "2026-09-09T09:00:00.000Z" },
        { email: "idle@example.com", createdAt: "2026-09-10T09:00:00.000Z" },
        { email: "new@example.com", createdAt: "2026-09-29T09:00:00.000Z" },
        { email: "demo@roadverdict.co.uk", createdAt: "2026-09-09T09:00:00.000Z" },
      ],
      vehicleOwners: new Set(["keen@example.com", "once@example.com", "new@example.com"]),
      records: [
        record("keen@example.com", "2026-09-08T10:00:00.000Z"),
        record("keen@example.com", "2026-09-17T10:00:00.000Z"),
        record("once@example.com", "2026-09-09T10:00:00.000Z"),
        record("new@example.com", "2026-09-30T10:00:00.000Z"),
      ],
    });
    const september7 = stats.cohorts.find((c) => c.weekStart === "2026-09-07");
    expect(september7).toEqual({ weekStart: "2026-09-07", accounts: 3, addedVehicle: 2, addedRecord: 2, week2Eligible: 3, week2: 1 });
    // Too new to have had a second week yet.
    expect(stats.cohorts[0]).toEqual({ weekStart: "2026-09-28", accounts: 1, addedVehicle: 1, addedRecord: 1, week2Eligible: 0, week2: 0 });
    expect(stats.cohorts).toHaveLength(6);
  });
});
