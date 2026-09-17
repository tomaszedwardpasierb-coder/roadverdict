import { describe, expect, it } from "vitest";
import { monthsBetween, computeReminderStatus, reminderDetailLabel, computeTriggerDueValue } from "@/lib/tracker/reminderStatus";

function isoDaysFromNow(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString();
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe("monthsBetween", () => {
  it("counts whole calendar months, including across a year boundary", () => {
    expect(monthsBetween(new Date("2025-11-01"), new Date("2026-02-01"))).toBe(3);
  });
});

describe("computeReminderStatus", () => {
  it("is overdue for a date-type trigger whose date has already passed", () => {
    const r = { intervalType: "date", intervalValue: undefined, exactDate: isoDaysFromNow(-1), date: "2025-01-01", baseMileage: 0 } as any;
    expect(computeReminderStatus(r, 5000)).toBe("overdue");
  });

  it("is due-soon for a date-type trigger within the next 14 days", () => {
    const r = { intervalType: "date", exactDate: isoDaysFromNow(10), date: "2025-01-01", baseMileage: 0 } as any;
    expect(computeReminderStatus(r, 5000)).toBe("due-soon");
  });

  it("is ok for a date-type trigger comfortably in the future", () => {
    const r = { intervalType: "date", exactDate: isoDaysFromNow(60), date: "2025-01-01", baseMileage: 0 } as any;
    expect(computeReminderStatus(r, 5000)).toBe("ok");
  });

  it("is overdue for a mileage-type trigger once the full interval is used up", () => {
    const r = { intervalType: "mileage", intervalValue: 1000, baseMileage: 4000, date: "2025-01-01" } as any;
    expect(computeReminderStatus(r, 5000)).toBe("overdue"); // 1000/1000 = 100%
  });

  it("is due-soon at the 85% threshold for a mileage-type trigger", () => {
    const r = { intervalType: "mileage", intervalValue: 1000, baseMileage: 4000, date: "2025-01-01" } as any;
    expect(computeReminderStatus(r, 4850)).toBe("due-soon"); // 850/1000 = 85%
  });

  it("is ok just below the 85% threshold for a mileage-type trigger", () => {
    const r = { intervalType: "mileage", intervalValue: 1000, baseMileage: 4000, date: "2025-01-01" } as any;
    expect(computeReminderStatus(r, 4840)).toBe("ok"); // 84%
  });

  it("computes a months-type trigger the same way, using the real elapsed months", () => {
    const twoMonthsAgo = new Date();
    // Anchor to day 1 before subtracting months - otherwise JS Date's
    // setMonth silently overflows into the following month whenever
    // today's day-of-month doesn't exist in the target month (e.g. day 31
    // landing on a 30-day month), which flakes this test near month-end.
    twoMonthsAgo.setDate(1);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const r = { intervalType: "months", intervalValue: 2, date: isoDate(twoMonthsAgo), baseMileage: 0 } as any;
    expect(computeReminderStatus(r, 5000)).toBe("overdue");
  });

  // "Whichever comes first": the overall status is the worst of every
  // trigger in the set, not an average or just the primary one.
  it("reports the worst status across the primary trigger and any additional ones", () => {
    const r = {
      intervalType: "mileage", intervalValue: 10000, baseMileage: 0, date: "2025-01-01", // primary: barely started, would be "ok"
      additionalTriggers: [{ intervalType: "date", exactDate: isoDaysFromNow(-1) }], // this one is overdue
    } as any;
    expect(computeReminderStatus(r, 100)).toBe("overdue");
  });

  // A permanent (SORN) reminder never resolves via date/mileage math -
  // it's always the most urgent state, regardless of current mileage.
  it("is always overdue for a permanent-type trigger", () => {
    const r = { intervalType: "permanent", date: "2025-01-01" } as any;
    expect(computeReminderStatus(r, 999999)).toBe("overdue");
    expect(computeReminderStatus(r, 0)).toBe("overdue");
  });
});

describe("reminderDetailLabel", () => {
  it("labels a single mileage-type trigger with the due mileage and interval", () => {
    const r = { intervalType: "mileage", intervalValue: 1000, baseMileage: 4000, date: "2025-01-01" } as any;
    expect(reminderDetailLabel(r)).toBe("due around 5,000 miles (every 1,000 mi)");
  });

  it("labels a single date-type trigger with the formatted date", () => {
    const r = { intervalType: "date", exactDate: "2026-05-01", date: "2025-01-01", baseMileage: 0 } as any;
    expect(reminderDetailLabel(r)).toBe("due on 1 May 2026");
  });

  // Multiple triggers join with an explicit "whichever comes first" -
  // single-trigger wording is unchanged from before this feature existed.
  it("joins multiple triggers with 'or ... whichever comes first'", () => {
    const r = {
      intervalType: "mileage", intervalValue: 1000, baseMileage: 4000, date: "2025-01-01",
      additionalTriggers: [{ intervalType: "date", exactDate: "2026-05-01" }],
    } as any;
    expect(reminderDetailLabel(r)).toBe("due around 5,000 miles (every 1,000 mi), or on 1 May 2026 - whichever comes first");
  });

  it("explains what clears a permanent-type reminder, rather than a due date/mileage it doesn't have", () => {
    const r = { intervalType: "permanent", date: "2025-01-01" } as any;
    expect(reminderDetailLabel(r)).toBe("Clears automatically once the vehicle is confirmed taxed again");
  });
});

// The real due-value math, lifted out of triggerDetail's string
// formatting above so costForecast.ts can use the same numbers rather
// than parsing them back out of human-readable text - see this
// function's own comment for the full reasoning.
describe("computeTriggerDueValue", () => {
  it("returns the due mileage for a mileage-type trigger, added onto baseMileage", () => {
    const t = { intervalType: "mileage" as const, intervalValue: 4000 };
    const r = { intervalType: "mileage", intervalValue: 4000, baseMileage: 10000, date: "2025-01-01" } as any;
    expect(computeTriggerDueValue(t, r)).toEqual({ type: "mileage", dueMileage: 14000 });
  });

  it("treats a missing baseMileage as zero", () => {
    const t = { intervalType: "mileage" as const, intervalValue: 4000 };
    const r = { intervalType: "mileage", intervalValue: 4000, date: "2025-01-01" } as any;
    expect(computeTriggerDueValue(t, r)).toEqual({ type: "mileage", dueMileage: 4000 });
  });

  it("returns the due date for a months-type trigger, added onto the reminder's own date", () => {
    const t = { intervalType: "months" as const, intervalValue: 6 };
    const r = { intervalType: "months", intervalValue: 6, date: "2025-01-15" } as any;
    const due = computeTriggerDueValue(t, r);
    expect(due?.type).toBe("months");
    // Compared as local calendar values, not via toISOString() - the
    // source builds this date with `new Date(year, month, day)` (local
    // time), so a UTC-string comparison would shift by a day whenever
    // the machine running this test isn't itself on UTC.
    const dueDate = new Date(due!.dueDate!);
    expect(dueDate.getFullYear()).toBe(2025);
    expect(dueDate.getMonth()).toBe(6); // July, 0-indexed
    expect(dueDate.getDate()).toBe(15);
  });

  it("returns exactDate as-is for a date-type trigger", () => {
    const t = { intervalType: "date" as const, exactDate: "2026-03-01" };
    const r = { intervalType: "date", exactDate: "2026-03-01", date: "2025-01-01" } as any;
    expect(computeTriggerDueValue(t, r)).toEqual({ type: "date", dueDate: "2026-03-01" });
  });

  it("returns a bare permanent marker, with no due point at all", () => {
    const t = { intervalType: "permanent" as const };
    const r = { intervalType: "permanent", date: "2025-01-01" } as any;
    expect(computeTriggerDueValue(t, r)).toEqual({ type: "permanent" });
  });

  it("returns null for a mileage/months trigger with no intervalValue - nothing to compute a due point from", () => {
    const t = { intervalType: "mileage" as const };
    const r = { intervalType: "mileage", date: "2025-01-01" } as any;
    expect(computeTriggerDueValue(t, r)).toBeNull();
  });
});