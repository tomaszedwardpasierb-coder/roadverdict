import { describe, expect, it } from "vitest";
import { filterByDateRange } from "@/lib/tracker/dateRange";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

describe("filterByDateRange", () => {
  it("returns everything unfiltered for 'all'", () => {
    const items = [{ date: daysAgo(1000) }, { date: daysAgo(1) }];
    expect(filterByDateRange(items, "all")).toHaveLength(2);
  });

  it("keeps items within the last week, excludes older ones", () => {
    const items = [{ date: daysAgo(2) }, { date: daysAgo(30) }];
    expect(filterByDateRange(items, "1w")).toEqual([{ date: daysAgo(2) }]);
  });

  it("includes items from the start of the current year for 'ytd', excludes prior-year items", () => {
    const thisYear = new Date().getFullYear();
    const items = [
      { date: `${thisYear}-01-02` },
      { date: `${thisYear - 1}-12-31` },
    ];
    expect(filterByDateRange(items, "ytd")).toEqual([{ date: `${thisYear}-01-02` }]);
  });
});