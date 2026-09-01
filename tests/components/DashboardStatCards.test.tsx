// Place at: tests/components/DashboardStatCards.test.tsx
//
// The three sidebar/summary stat cards. ChartFilterContext has a safe
// no-Provider fallback ("all" range) - exercised directly in most tests
// below, with one test wrapping in a real ChartFilterProvider to check
// the range filter is genuinely applied, not just accepted as a prop.
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardStatCards } from "@/app/dashboard/DashboardStatCards";
import { ChartFilterProvider, useChartFilter } from "@/app/dashboard/ChartFilterContext";

function SetRange({ value }: { value: "all" | "1w" }) {
  const { setRange } = useChartFilter();
  useEffect(() => {
    setRange(value);
  }, [value, setRange]);
  return null;
}

describe("DashboardStatCards", () => {
  it("sums every category's cost, shows a dash for economy with no fuel logs, and computes cost-per-mile from the bike's lifetime bookends", () => {
    render(
      <DashboardStatCards
        records={[{ date: "2026-01-01", cost: 100, mileage: 500 }]}
        mods={[{ date: "2026-02-01", cost: 50, mileage: 800 }]}
        bills={[{ date: "2026-03-01", cost: 30 }]}
        fuelLogs={[]}
        currentMileage={1000}
        startingMileage={0}
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        fuelEconomyUnit="mpg"
      />
    );
    expect(screen.getByText("Total spend")).toBeInTheDocument();
    expect(screen.getByText("£180")).toBeInTheDocument();
    expect(screen.getByText("Actual economy")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.getByText("Per mile")).toBeInTheDocument();
    expect(screen.getByText("18.0p")).toBeInTheDocument(); // (£180 / 1000mi) * 100
  });

  it("computes actual MPG from real fuel-log segments (miles between full-tank fill-ups / litres used), not a naive average", () => {
    render(
      <DashboardStatCards
        records={[]}
        mods={[]}
        bills={[]}
        fuelLogs={[
          { id: "f1", mileage: 1000, litres: 4.546, filledToFull: true, date: "2026-01-01", cost: 5 },
          { id: "f2", mileage: 1100, litres: 4.546, filledToFull: true, date: "2026-02-01", cost: 5 },
        ]}
        currentMileage={1100}
        startingMileage={1000}
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        fuelEconomyUnit="mpg"
      />
    );
    // 100 miles on 1 UK gallon (4.546L) between the two full fill-ups = 100.0 mpg
    expect(screen.getByText("100.0 mpg")).toBeInTheDocument();
    expect(screen.getByText("£10")).toBeInTheDocument();
  });

  it("converts total spend into the given currency and cost-per-distance into the given distance unit", () => {
    render(
      <DashboardStatCards
        records={[]}
        mods={[]}
        bills={[{ date: "2026-01-01", cost: 50 }]}
        fuelLogs={[]}
        currentMileage={100}
        startingMileage={0}
        currency="EUR"
        rates={{ base: "GBP", rates: { EUR: 2 }, fetchedAt: "2026-01-01T00:00:00.000Z" }}
        distanceUnit="km"
        fuelEconomyUnit="mpg"
      />
    );
    expect(screen.getByText("€100")).toBeInTheDocument(); // £50 * rate 2
    expect(screen.getByText("Per km")).toBeInTheDocument();
    // Per-distance now converts through the same EUR rate as "Total
    // spend" above, rather than staying in raw GBP pence: €100 over 100
    // miles = €1/mile, converted to per-km (÷ KM_PER_MILE) = €0.62/km.
    expect(screen.getByText("€0.62")).toBeInTheDocument();
  });

  it("falls back to a dash for cost-per-distance when the bike's starting and current mileage are identical (no real distance to divide by)", () => {
    render(
      <DashboardStatCards
        records={[]}
        mods={[]}
        bills={[{ date: "2026-01-01", cost: 20 }]}
        fuelLogs={[]}
        currentMileage={500}
        startingMileage={500}
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        fuelEconomyUnit="mpg"
      />
    );
    expect(screen.getByText("£20")).toBeInTheDocument();
    const dashes = screen.getAllByText("-");
    expect(dashes).toHaveLength(2); // both economy and per-mile fall back
  });

  it("respects an active ChartFilterContext range, summing only entries that actually fall inside it", () => {
    const today = new Date().toISOString().slice(0, 10);
    render(
      <ChartFilterProvider>
        <SetRange value="1w" />
        <DashboardStatCards
          records={[]}
          mods={[]}
          bills={[
            { date: "2000-01-01", cost: 500 },
            { date: today, cost: 50 },
          ]}
          fuelLogs={[]}
          currentMileage={100}
          startingMileage={0}
          currency="GBP"
          rates={null}
          distanceUnit="mi"
          fuelEconomyUnit="mpg"
        />
      </ChartFilterProvider>
    );
    expect(screen.getByText("£50")).toBeInTheDocument();
    expect(screen.queryByText("£550")).not.toBeInTheDocument();
  });
});
