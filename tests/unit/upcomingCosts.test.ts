import { describe, expect, it } from "vitest";
import { buildUpcomingCostItems } from "@/lib/tracker/upcomingCosts";
import { getInflationAdjustedBenchmark } from "@/lib/priceData";

function reminder(sourceKey: string | undefined, name = "Reminder"): any {
  return { name, sourceKey, intervalType: "mileage", intervalValue: 6000, additionalTriggers: [] };
}

describe("buildUpcomingCostItems", () => {
  it("prices a service-sourced reminder for a benchmarked job type using the real inflation-adjusted benchmark", () => {
    const items = buildUpcomingCostItems(
      [{ reminder: reminder("service:full-service"), status: "due-soon" }],
      [],
      "medium"
    );
    const expected = getInflationAdjustedBenchmark("full-service", "medium");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      jobType: "full-service",
      timing: "due-soon",
      pricing: { status: "priced", low: expected.low, high: expected.high },
    });
  });

  it("leaves a service-sourced reminder unpriced when its job type has no benchmark", () => {
    const items = buildUpcomingCostItems(
      [{ reminder: reminder("service:engine-rebuild"), status: "overdue" }],
      [],
      "medium"
    );
    expect(items[0].pricing).toEqual({ status: "not-priced" });
  });

  // Only reminders whose sourceKey identifies them as service-derived
  // belong in this list at all - a bill-sourced reminder (insurance,
  // tax) or a manually created one with no sourceKey isn't a
  // maintenance cost this module should be pricing.
  it("excludes reminders that aren't service-sourced", () => {
    const items = buildUpcomingCostItems(
      [
        { reminder: reminder("bill:insurance"), status: "due-soon" },
        { reminder: reminder(undefined), status: "due-soon" },
      ],
      [],
      "medium"
    );
    expect(items).toHaveLength(0);
  });

  it("extracts the job type from the sourceKey by stripping the 'service:' prefix", () => {
    const items = buildUpcomingCostItems(
      [{ reminder: reminder("service:tyres-pair"), status: "due-soon" }],
      [],
      "medium"
    );
    expect(items[0].jobType).toBe("tyres-pair");
  });

  it("includes a due-soon consumable with its mileage-based timing detail", () => {
    const items = buildUpcomingCostItems(
      [],
      [{ jobType: "full-service", label: "Full service", status: "due-soon", lastDoneMileage: 12000, lastDoneDate: "2025-01-01", intervalMiles: 6000 }],
      "medium"
    );
    expect(items[0].timingDetail).toBe("last done at 12,000 mi, typically due again every 6,000 mi");
  });

  it("omits the recurrence note when a consumable has no known interval", () => {
    const items = buildUpcomingCostItems(
      [],
      [{ jobType: "full-service", label: "Full service", status: "due-soon", lastDoneMileage: 12000, lastDoneDate: "2025-01-01", intervalMiles: undefined }],
      "medium"
    );
    expect(items[0].timingDetail).toBe("last done at 12,000 mi");
  });

  it("prices a consumable the same way as a reminder, using the real benchmark", () => {
    const items = buildUpcomingCostItems(
      [],
      [{ jobType: "brake-pads-front", label: "Front brake pads", status: "overdue", lastDoneMileage: 8000, lastDoneDate: "2025-01-01", intervalMiles: 12000 }],
      "small"
    );
    const expected = getInflationAdjustedBenchmark("brake-pads-front", "small");
    expect(items[0].pricing).toMatchObject({ status: "priced", low: expected.low, high: expected.high });
  });

  it("combines reminders and consumables into one list", () => {
    const items = buildUpcomingCostItems(
      [{ reminder: reminder("service:full-service"), status: "due-soon" }],
      [{ jobType: "tyres-pair", label: "Tyres", status: "overdue", lastDoneMileage: 5000, lastDoneDate: "2025-01-01", intervalMiles: 8000 }],
      "medium"
    );
    expect(items).toHaveLength(2);
  });
});