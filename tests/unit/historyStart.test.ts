import { describe, expect, it } from "vitest";
import { historyStart } from "@/lib/tracker/bikeComparisonPeriod";

describe("historyStart", () => {
  it("starts from history logged before the vehicle was added", () => {
    // Added in 2026 at 35,000 miles, with receipts logged back to 2016.
    const points = [
      { date: "2016-03-01", mileage: 1200 },
      { date: "2021-06-10", mileage: 18000 },
      { date: "2026-08-16", mileage: 35621 },
    ];
    expect(historyStart(points, 35000, "2026-09-20")).toEqual({ mileage: 1200, date: "2016-03-01" });
  });

  it("keeps the vehicle's own starting point when nothing earlier was logged", () => {
    const points = [{ date: "2026-10-01", mileage: 12500 }];
    expect(historyStart(points, 12000, "2026-09-01")).toEqual({ mileage: 12000, date: "2026-09-01" });
  });

  it("ignores entries without a real mileage", () => {
    const points = [{ date: "2020-01-01", mileage: 0 }];
    expect(historyStart(points, 8000, "2026-01-01")).toEqual({ mileage: 8000, date: "2020-01-01" });
  });
});
