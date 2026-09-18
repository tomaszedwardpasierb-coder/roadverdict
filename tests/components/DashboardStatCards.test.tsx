// Place at: tests/components/DashboardStatCards.test.tsx
//
// The five dashboard stat cards. ChartFilterContext has a safe
// no-Provider fallback ("all" range, forecast off) - exercised directly
// in most tests below, with real ChartFilterProvider wrapping used where
// a test needs to actually change range or forecast state.
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardStatCards } from "@/app/dashboard/DashboardStatCards";
import { ChartFilterProvider, useChartFilter } from "@/app/dashboard/ChartFilterContext";
import styles from "@/app/dashboard/dashboard.module.css";

function SetRange({ value }: { value: "all" | "1w" }) {
  const { setRange } = useChartFilter();
  useEffect(() => {
    setRange(value);
  }, [value, setRange]);
  return null;
}

function ForecastControls() {
  const { setForecastMode, setForecastWindow } = useChartFilter();
  return (
    <div>
      <button type="button" onClick={() => setForecastMode(true)}>enable forecast</button>
      <button type="button" onClick={() => setForecastWindow("1y")}>window 1y</button>
    </div>
  );
}

// Neutral defaults for the props every test needs but few tests actually
// care about - spread first, individual tests override what matters.
const yearDefaults = { currentYear: 2026, yearSpend: 0, yearEndProjection: null };

describe("DashboardStatCards", () => {
  it("sums every category's cost, shows a dash for economy with no fuel logs, and computes cost-per-mile from the bike's lifetime bookends", () => {
    render(
      <DashboardStatCards
        records={[{ date: "2026-01-01", cost: 100, mileage: 500 }]}
        mods={[{ date: "2026-02-01", cost: 50, mileage: 800 }]}
        labour={[]}
        bills={[{ date: "2026-03-01", cost: 30 }]}
        fuelLogs={[]}
        currentMileage={1000}
        startingMileage={0}
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        fuelEconomyUnit="mpg"
        isPro
        {...yearDefaults}
      />
    );
    expect(screen.getByText("Total spend")).toBeInTheDocument();
    expect(screen.getByText("£180.00")).toBeInTheDocument();
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
        labour={[]}
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
        isPro
        {...yearDefaults}
      />
    );
    // 100 miles on 1 UK gallon (4.546L) between the two full fill-ups = 100.0 mpg
    expect(screen.getByText("100.0 mpg")).toBeInTheDocument();
    expect(screen.getByText("£10.00")).toBeInTheDocument();
  });

  it("converts total spend into the given currency and cost-per-distance into the given distance unit", () => {
    render(
      <DashboardStatCards
        records={[]}
        mods={[]}
        labour={[]}
        bills={[{ date: "2026-01-01", cost: 50 }]}
        fuelLogs={[]}
        currentMileage={100}
        startingMileage={0}
        currency="EUR"
        rates={{ base: "GBP", rates: { EUR: 2 }, fetchedAt: "2026-01-01T00:00:00.000Z" }}
        distanceUnit="km"
        fuelEconomyUnit="mpg"
        isPro
        {...yearDefaults}
      />
    );
    expect(screen.getByText("€100.00")).toBeInTheDocument(); // £50 * rate 2
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
        labour={[]}
        bills={[{ date: "2026-01-01", cost: 20 }]}
        fuelLogs={[]}
        currentMileage={500}
        startingMileage={500}
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        fuelEconomyUnit="mpg"
        isPro
        {...yearDefaults}
      />
    );
    expect(screen.getByText("£20.00")).toBeInTheDocument();
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
          labour={[]}
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
          {...yearDefaults}
        />
      </ChartFilterProvider>
    );
    expect(screen.getByText("£50.00")).toBeInTheDocument();
    expect(screen.queryByText("£550.00")).not.toBeInTheDocument();
  });

  it("locks Actual economy and Per mile behind Premium when isPro is false, while Total spend and Current miles stay real", () => {
    render(
      <DashboardStatCards
        records={[{ date: "2026-01-01", cost: 100, mileage: 500 }]}
        mods={[]}
        labour={[]}
        bills={[]}
        fuelLogs={[]}
        currentMileage={1000}
        startingMileage={0}
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        fuelEconomyUnit="mpg"
        {...yearDefaults}
      />
    );
    expect(screen.getByText("Total spend")).toBeInTheDocument();
    expect(screen.getByText("£100.00")).toBeInTheDocument();
    expect(screen.getByText("Actual economy")).toBeInTheDocument();
    expect(screen.getByText("Per mile")).toBeInTheDocument();
    expect(screen.getByText("Current miles")).toBeInTheDocument();
    expect(screen.getByText("1,000")).toBeInTheDocument();
    // Actual economy, Per mile, Spend this year - 3 locked cards.
    expect(screen.getAllByText("Premium")).toHaveLength(3);
    // Real computed values must not leak out from behind the lock.
    expect(screen.queryByText("-")).not.toBeInTheDocument();
  });

  it("defaults to locked when isPro isn't passed at all", () => {
    render(
      <DashboardStatCards
        records={[]}
        mods={[]}
        labour={[]}
        bills={[]}
        fuelLogs={[]}
        currentMileage={100}
        startingMileage={0}
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        fuelEconomyUnit="mpg"
        {...yearDefaults}
      />
    );
    expect(screen.getAllByText("Premium")).toHaveLength(3);
  });

  it("shows Current miles unlocked and Spend this year unlocked-but-Premium-gated even when isPro is false", () => {
    render(
      <DashboardStatCards
        records={[]}
        mods={[]}
        labour={[]}
        bills={[]}
        fuelLogs={[]}
        currentMileage={12345}
        startingMileage={0}
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        fuelEconomyUnit="mpg"
        {...yearDefaults}
      />
    );
    expect(screen.getByText("Current miles")).toBeInTheDocument();
    expect(screen.getByText("12,345")).toBeInTheDocument();
    expect(screen.getByText("Spend this year")).toBeInTheDocument();
  });

  it("shows the real year-to-date spend for 'Spend this year' when isPro", () => {
    render(
      <DashboardStatCards
        records={[]}
        mods={[]}
        labour={[]}
        bills={[]}
        fuelLogs={[]}
        currentMileage={0}
        startingMileage={0}
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        fuelEconomyUnit="mpg"
        isPro
        currentYear={2026}
        yearSpend={840}
        yearEndProjection={null}
      />
    );
    expect(screen.getByText("Spend this year")).toBeInTheDocument();
    expect(screen.getByText("£840.00")).toBeInTheDocument();
  });

  // Forecast mode - Total spend/Per mile/Current miles swap to their
  // projected figures once there's a precomputed number for the
  // currently selected window; Spend this year swaps independently,
  // keyed off yearEndProjection rather than forecastWindow (see
  // DashboardStatCards.tsx's own comment on why).
  describe("forecast mode", () => {
    const spendForecastByWindow = { "1w": 5, "1m": 20, "6m": 300, "1y": 600 } as const;
    // This card only reads the LAST point of each window's mileage
    // trend (mileage at the end of the window) - a single-point array
    // per window is enough to exercise that, without needing the real
    // engine's full multi-point shape.
    const mileageForecastByWindow = {
      "1w": [{ month: "Next week", total: 1050 }],
      "1m": [{ month: "Next month", total: 1200 }],
      "6m": [{ month: "Nov 26", total: 1600 }],
      "1y": [{ month: "May 27", total: 2000 }],
    };

    it("swaps Total spend, Per mile, and Current miles to their projected figures for the active window", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <DashboardStatCards
            records={[]}
            mods={[]}
            labour={[]}
            bills={[]}
            fuelLogs={[]}
            currentMileage={1000}
            startingMileage={0}
            currency="GBP"
            rates={null}
            distanceUnit="mi"
            fuelEconomyUnit="mpg"
            isPro
            {...yearDefaults}
            spendForecastByWindow={spendForecastByWindow}
            mileageForecastByWindow={mileageForecastByWindow}
          />
        </ChartFilterProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      // Default window is 6m: spend £300, mileage 1600.
      expect(screen.getByText("Projected spend")).toBeInTheDocument();
      expect(screen.getByText("£300.00")).toBeInTheDocument();
      expect(screen.getByText("Projected miles")).toBeInTheDocument();
      expect(screen.getByText("1,600")).toBeInTheDocument();
      // £300 spent over 600 projected extra miles (1600 - 1000) = 50p/mile.
      expect(screen.getByText("Projected per mile")).toBeInTheDocument();
      expect(screen.getByText("50.0p")).toBeInTheDocument();
    });

    it("switching the forecast window swaps in that window's own precomputed figures", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <DashboardStatCards
            records={[]}
            mods={[]}
            labour={[]}
            bills={[]}
            fuelLogs={[]}
            currentMileage={1000}
            startingMileage={0}
            currency="GBP"
            rates={null}
            distanceUnit="mi"
            fuelEconomyUnit="mpg"
            isPro
            {...yearDefaults}
            spendForecastByWindow={spendForecastByWindow}
            mileageForecastByWindow={mileageForecastByWindow}
          />
        </ChartFilterProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));
      await user.click(screen.getByRole("button", { name: "window 1y" }));

      expect(screen.getByText("£600.00")).toBeInTheDocument();
      expect(screen.getByText("2,000")).toBeInTheDocument();
    });

    it("shows real, not projected, figures when Forecast mode is on but no forecast data was ever wired up", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <DashboardStatCards
            records={[{ date: "2026-01-01", cost: 100, mileage: 500 }]}
            mods={[]}
            labour={[]}
            bills={[]}
            fuelLogs={[]}
            currentMileage={1000}
            startingMileage={0}
            currency="GBP"
            rates={null}
            distanceUnit="mi"
            fuelEconomyUnit="mpg"
            isPro
            {...yearDefaults}
          />
        </ChartFilterProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      expect(screen.getByText("Total spend")).toBeInTheDocument();
      expect(screen.getByText("£100.00")).toBeInTheDocument();
      expect(screen.getByText("Current miles")).toBeInTheDocument();
    });

    it("swaps 'Spend this year' to the year-end projection once Forecast mode is on and there is one, independent of forecastWindow", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <DashboardStatCards
            records={[]}
            mods={[]}
            labour={[]}
            bills={[]}
            fuelLogs={[]}
            currentMileage={0}
            startingMileage={0}
            currency="GBP"
            rates={null}
            distanceUnit="mi"
            fuelEconomyUnit="mpg"
            isPro
            currentYear={2026}
            yearSpend={400}
            yearEndProjection={{ projected: 1200, daysElapsed: 100 }}
          />
        </ChartFilterProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      expect(screen.getByText("Projected for 2026")).toBeInTheDocument();
      expect(screen.getByText("£1200.00")).toBeInTheDocument();
      expect(screen.queryByText("£400.00")).not.toBeInTheDocument();
    });

    it("keeps showing the real year-to-date spend in Forecast mode when there's no year-end projection yet", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <DashboardStatCards
            records={[]}
            mods={[]}
            labour={[]}
            bills={[]}
            fuelLogs={[]}
            currentMileage={0}
            startingMileage={0}
            currency="GBP"
            rates={null}
            distanceUnit="mi"
            fuelEconomyUnit="mpg"
            isPro
            currentYear={2026}
            yearSpend={400}
            yearEndProjection={null}
          />
        </ChartFilterProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      expect(screen.getByText("Spend this year")).toBeInTheDocument();
      expect(screen.getByText("£400.00")).toBeInTheDocument();
    });
  });
});
