// Place at: tests/unit/carReminderStatus.test.ts
// Covers only the "permanent" (SORN) branch added to computeCarReminderStatus/
// carReminderDetailLabel - the rest of this file's logic mirrors
// reminderStatus.ts's own (already covered by reminderStatus.test.ts) byte
// for byte, so it isn't re-verified here.
import { describe, expect, it } from "vitest";
import { computeCarReminderStatus, carReminderDetailLabel } from "@/lib/tracker/carReminderStatus";

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
