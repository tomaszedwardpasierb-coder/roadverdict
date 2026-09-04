import { describe, expect, it } from "vitest";
import {
  paymentDateForIndex,
  paymentAmountForIndex,
  instalmentNote,
  seriesEndDate,
  seriesTotalCost,
  computeDueInstalments,
} from "@/lib/tracker/billSeriesSchedule";

describe("paymentDateForIndex", () => {
  it("returns startDate exactly for index 0, ignoring collectionDay", () => {
    const series = { startDate: "2025-01-15", frequency: "monthly" as const, collectionDay: 1 };
    expect(paymentDateForIndex(series, 0)).toBe("2025-01-15");
  });

  it("steps by one month at a time for a monthly plan", () => {
    const series = { startDate: "2025-01-05", frequency: "monthly" as const, collectionDay: 5 };
    expect(paymentDateForIndex(series, 1)).toBe("2025-02-05");
    expect(paymentDateForIndex(series, 2)).toBe("2025-03-05");
  });

  it("steps by six months at a time for a six-monthly plan", () => {
    const series = { startDate: "2025-01-05", frequency: "six-monthly" as const, collectionDay: 5 };
    expect(paymentDateForIndex(series, 1)).toBe("2025-07-05");
    expect(paymentDateForIndex(series, 2)).toBe("2026-01-05");
  });

  it("clamps to the last real day of a shorter month instead of overflowing into the next one", () => {
    // Starting the 31st of January, collection day 31 - February has no
    // 31st, so it must clamp to the 28th (2025 isn't a leap year), NOT
    // roll over into March the way naive setDate/setMonth arithmetic would.
    const series = { startDate: "2025-01-31", frequency: "monthly" as const, collectionDay: 31 };
    expect(paymentDateForIndex(series, 1)).toBe("2025-02-28");
  });

  it("clamps correctly in a leap year February", () => {
    const series = { startDate: "2024-01-31", frequency: "monthly" as const, collectionDay: 31 };
    expect(paymentDateForIndex(series, 1)).toBe("2024-02-29");
  });

  it("uses collectionDay, not startDate's own day, for every index after 0", () => {
    // Deposit on the 15th, but the agreed collection day is the 1st -
    // every later payment should land on the 1st, not drift from the 15th.
    const series = { startDate: "2025-01-15", frequency: "monthly" as const, collectionDay: 1 };
    expect(paymentDateForIndex(series, 1)).toBe("2025-02-01");
  });

  it("carries correctly across a year boundary", () => {
    const series = { startDate: "2025-11-15", frequency: "monthly" as const, collectionDay: 15 };
    expect(paymentDateForIndex(series, 2)).toBe("2026-01-15");
  });

  it("produces a monotonically increasing date for every later index, even across repeated month-end clamps", () => {
    const series = { startDate: "2025-01-31", frequency: "monthly" as const, collectionDay: 30 };
    const dates = Array.from({ length: 12 }, (_, i) => paymentDateForIndex(series, i));
    for (let i = 1; i < dates.length; i++) {
      expect(new Date(dates[i]).getTime()).toBeGreaterThan(new Date(dates[i - 1]).getTime());
    }
  });
});

describe("paymentAmountForIndex", () => {
  it("uses depositAmount for index 0 when one is set", () => {
    expect(paymentAmountForIndex({ depositAmount: 110, instalmentAmount: 42.5 }, 0)).toBe(110);
  });

  it("falls back to instalmentAmount for index 0 when no deposit is set", () => {
    expect(paymentAmountForIndex({ instalmentAmount: 42.5 }, 0)).toBe(42.5);
  });

  it("always uses instalmentAmount for every index after 0, regardless of deposit", () => {
    expect(paymentAmountForIndex({ depositAmount: 110, instalmentAmount: 42.5 }, 1)).toBe(42.5);
    expect(paymentAmountForIndex({ depositAmount: 110, instalmentAmount: 42.5 }, 5)).toBe(42.5);
  });
});

describe("instalmentNote", () => {
  it("labels index 0 as a deposit when one is set", () => {
    expect(instalmentNote({ instalmentCount: 12, depositAmount: 110 }, 0)).toBe("Deposit (payment 1 of 12)");
  });

  it("labels index 0 as a normal instalment when there's no deposit", () => {
    expect(instalmentNote({ instalmentCount: 12 }, 0)).toBe("Instalment 1 of 12");
  });

  it("labels a later index with its 1-based position", () => {
    expect(instalmentNote({ instalmentCount: 12, depositAmount: 110 }, 3)).toBe("Instalment 4 of 12");
  });
});

describe("seriesEndDate", () => {
  it("is one step past the final instalment, not the final instalment's own date", () => {
    const series = { startDate: "2025-01-01", frequency: "monthly" as const, collectionDay: 1, instalmentCount: 12 };
    // Index 11 (the 12th and last payment) lands 2025-12-01; the term
    // itself ends one month after that.
    expect(paymentDateForIndex(series, 11)).toBe("2025-12-01");
    expect(seriesEndDate(series)).toBe("2026-01-01");
  });
});

describe("seriesTotalCost", () => {
  it("is deposit plus every regular instalment, never annual-premium-divided-by-N", () => {
    expect(seriesTotalCost({ depositAmount: 110, instalmentAmount: 42.5, instalmentCount: 12 })).toBeCloseTo(110 + 11 * 42.5);
  });

  it("is instalmentAmount times instalmentCount when there's no deposit", () => {
    expect(seriesTotalCost({ instalmentAmount: 30, instalmentCount: 12 })).toBe(360);
  });

  it("is zero for a plan with no payments", () => {
    expect(seriesTotalCost({ instalmentAmount: 30, instalmentCount: 0 })).toBe(0);
  });
});

describe("computeDueInstalments", () => {
  const activeSeries = {
    startDate: "2025-01-01",
    frequency: "monthly" as const,
    collectionDay: 1,
    depositAmount: 110,
    instalmentAmount: 42.5,
    instalmentCount: 12,
    lastMaterializedIndex: -1,
    status: "active" as const,
  };

  it("returns nothing for a series that isn't active", () => {
    const ended = { ...activeSeries, status: "ended" as const };
    expect(computeDueInstalments(ended, new Date("2026-06-01"))).toEqual([]);
  });

  it("returns only the deposit when today is exactly the start date", () => {
    const due = computeDueInstalments(activeSeries, new Date("2025-01-01"));
    expect(due).toEqual([{ index: 0, date: "2025-01-01", cost: 110 }]);
  });

  it("returns nothing new once every due instalment has already been materialised", () => {
    const series = { ...activeSeries, lastMaterializedIndex: 0 };
    expect(computeDueInstalments(series, new Date("2025-01-01"))).toEqual([]);
  });

  it("returns every instalment due by today, picking up from the last materialised one", () => {
    const series = { ...activeSeries, lastMaterializedIndex: 0 };
    const due = computeDueInstalments(series, new Date("2025-04-15"));
    // lastMaterializedIndex 0 means indices 1, 2, 3 (Feb/Mar/Apr 1st) are
    // all now due; index 4 (May 1st) is not yet.
    expect(due.map((d) => d.index)).toEqual([1, 2, 3]);
    expect(due.every((d) => d.cost === 42.5)).toBe(true);
  });

  it("never returns an index at or beyond instalmentCount", () => {
    const series = { ...activeSeries, instalmentCount: 3, lastMaterializedIndex: 1 };
    const due = computeDueInstalments(series, new Date("2030-01-01"));
    expect(due.map((d) => d.index)).toEqual([2]);
  });

  it("stops at the first instalment not yet due rather than scanning past it", () => {
    const series = { ...activeSeries, lastMaterializedIndex: -1 };
    const due = computeDueInstalments(series, new Date("2025-02-15"));
    expect(due.map((d) => d.index)).toEqual([0, 1]);
  });
});
