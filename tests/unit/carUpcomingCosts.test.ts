import { describe, expect, it } from "vitest";
import { buildCarUpcomingCostItems } from "@/lib/tracker/carUpcomingCosts";
import { getInflationAdjustedCarBenchmark } from "@/lib/carPriceData";

function reminder(sourceKey: string | undefined, name = "Reminder"): any {
  return { name, sourceKey, intervalType: "mileage", intervalValue: 6000, additionalTriggers: [] };
}

describe("buildCarUpcomingCostItems", () => {
  it("prices a service-sourced reminder for a benchmarked job type using the real inflation-adjusted benchmark", () => {
    const items = buildCarUpcomingCostItems(
      [{ reminder: reminder("service:full-service"), status: "due-soon" }],
      [],
      "medium"
    );
    const expected = getInflationAdjustedCarBenchmark("full-service", "medium");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      jobType: "full-service",
      timing: "due-soon",
      pricing: { status: "priced", low: expected.low, high: expected.high },
    });
  });

  it("leaves a service-sourced reminder unpriced when its job type has no benchmark", () => {
    const items = buildCarUpcomingCostItems(
      [{ reminder: reminder("service:engine-rebuild"), status: "overdue" }],
      [],
      "medium"
    );
    expect(items[0].pricing).toEqual({ status: "not-priced" });
  });

  it("excludes reminders that aren't service-sourced", () => {
    const items = buildCarUpcomingCostItems(
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
    const items = buildCarUpcomingCostItems(
      [{ reminder: reminder("service:tyres-front-pair"), status: "due-soon" }],
      [],
      "medium"
    );
    expect(items[0].jobType).toBe("tyres-front-pair");
  });

  it("includes a due-soon consumable with its mileage-based timing detail", () => {
    const items = buildCarUpcomingCostItems(
      [],
      [{ jobType: "full-service", label: "Full service", status: "due-soon", lastDoneMileage: 12000, lastDoneDate: "2025-01-01", intervalMiles: 6000 }],
      "medium"
    );
    expect(items[0].timingDetail).toBe("last done at 12,000 mi, typically due again every 6,000 mi");
  });

  it("omits the recurrence note when a consumable has no known interval", () => {
    const items = buildCarUpcomingCostItems(
      [],
      [{ jobType: "full-service", label: "Full service", status: "due-soon", lastDoneMileage: 12000, lastDoneDate: "2025-01-01", intervalMiles: undefined }],
      "medium"
    );
    expect(items[0].timingDetail).toBe("last done at 12,000 mi");
  });

  it("prices a consumable the same way as a reminder, using the real benchmark", () => {
    const items = buildCarUpcomingCostItems(
      [],
      [{ jobType: "brake-pads-front", label: "Front brake pads", status: "overdue", lastDoneMileage: 8000, lastDoneDate: "2025-01-01", intervalMiles: 12000 }],
      "small"
    );
    const expected = getInflationAdjustedCarBenchmark("brake-pads-front", "small");
    expect(items[0].pricing).toMatchObject({ status: "priced", low: expected.low, high: expected.high });
  });

  it("combines reminders and consumables into one list", () => {
    const items = buildCarUpcomingCostItems(
      [{ reminder: reminder("service:full-service"), status: "due-soon" }],
      [{ jobType: "tyres-front-pair", label: "Front tyres", status: "overdue", lastDoneMileage: 5000, lastDoneDate: "2025-01-01", intervalMiles: 8000 }],
      "medium"
    );
    expect(items).toHaveLength(2);
  });
});
