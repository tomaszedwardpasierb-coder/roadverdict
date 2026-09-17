// Place at: tests/unit/carReminderStatus.test.ts
// Covers only the "permanent" (SORN) branch added to computeCarReminderStatus/
// carReminderDetailLabel - the rest of this file's logic mirrors
// reminderStatus.ts's own (already covered by reminderStatus.test.ts) byte
// for byte, so it isn't re-verified here.
import { describe, expect, it } from "vitest";
import { computeCarReminderStatus, carReminderDetailLabel, computeCarTriggerDueValue } from "@/lib/tracker/carReminderStatus";

describe("computeCarReminderStatus", () => {
  it("is always overdue for a permanent-type trigger, regardless of current mileage", () => {
    const r = { intervalType: "permanent", date: "2025-01-01" } as any;
    expect(computeCarReminderStatus(r, 999999)).toBe("overdue");
    expect(computeCarReminderStatus(r, 0)).toBe("overdue");
  });
});

describe("carReminderDetailLabel", () => {
  it("explains what clears a permanent-type reminder, rather than a due date/mileage it doesn't have", () => {
    const r = { intervalType: "permanent", date: "2025-01-01" } as any;
    expect(carReminderDetailLabel(r)).toBe("Clears automatically once the vehicle is confirmed taxed again");
  });
});

// Mirrors reminderStatus.test.ts's own computeTriggerDueValue coverage
// byte for byte (see this file's own top comment) - one representative
// case per trigger type, not a full re-test of already-covered logic.
describe("computeCarTriggerDueValue", () => {
  it("returns the due mileage for a mileage-type trigger", () => {
    const t = { intervalType: "mileage" as const, intervalValue: 10000 };
    const r = { intervalType: "mileage", intervalValue: 10000, baseMileage: 20000, date: "2025-01-01" } as any;
    expect(computeCarTriggerDueValue(t, r)).toEqual({ type: "mileage", dueMileage: 30000 });
  });

  it("returns exactDate as-is for a date-type trigger", () => {
    const t = { intervalType: "date" as const, exactDate: "2026-03-01" };
    const r = { intervalType: "date", exactDate: "2026-03-01", date: "2025-01-01" } as any;
    expect(computeCarTriggerDueValue(t, r)).toEqual({ type: "date", dueDate: "2026-03-01" });
  });

  it("returns a bare permanent marker, with no due point at all", () => {
    const t = { intervalType: "permanent" as const };
    const r = { intervalType: "permanent", date: "2025-01-01" } as any;
    expect(computeCarTriggerDueValue(t, r)).toEqual({ type: "permanent" });
  });
});
