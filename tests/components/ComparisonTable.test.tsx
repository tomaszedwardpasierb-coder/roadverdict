// Place at: tests/components/ComparisonTable.test.tsx
//
// Focused on the one behaviour this component gained when the garage
// compare page became mixed bike+car (see vehicleComparison.ts): a car
// entry's nextDue/documentationPct are always null (no car equivalent
// of getSellerReportCore exists yet), which must render as an honest
// "Not available yet", never as "0%" or "Nothing due soon" (both of
// which would misleadingly imply the data was actually checked).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComparisonTable } from "@/app/garage/compare/ComparisonTable";
import type { VehicleComparisonEntry } from "@/lib/tracker/vehicleComparison";

function makeEntry(overrides: Partial<VehicleComparisonEntry> = {}): VehicleComparisonEntry {
  return {
    bikeId: "v-1",
    kind: "bike",
    name: "Africa Twin",
    currentMileage: 10000,
    milesRidden: 8000,
    ownedSince: "2024-01-01",
    monthsOwned: 12,
    milesPerMonth: 666,
    spend: { servicingTotal: 100, modsTotal: 0, fuelTotal: 200, billsTotal: 50, labourTotal: 0, grandTotal: 350 },
    yearSpend: 350,
    costPerMile: 0.04,
    actualMpg: 55,
    serviceCount: 1,
    lastServiceDate: "2025-01-01",
    lastServiceMileage: 8000,
    nextDue: { name: "MOT", status: "due-soon" },
    documentationPct: 80,
    ...overrides,
  };
}

describe("ComparisonTable", () => {
  it("shows a real bike entry's nextDue and documentationPct as actual values", () => {
    render(<ComparisonTable entries={[makeEntry(), makeEntry({ bikeId: "v-2", name: "Tiger", documentationPct: 40, nextDue: null })]} currency="GBP" rates={null} distanceUnit="mi" period={null} />);

    expect(screen.getByText("MOT (due soon)")).toBeInTheDocument();
    expect(screen.getByText("Nothing due soon")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("shows 'Not available yet' for a car entry's Due soonest and Documentation columns, never '0%' or 'Nothing due soon'", () => {
    render(
      <ComparisonTable
        entries={[
          makeEntry({ bikeId: "bike-1", kind: "bike", name: "Africa Twin" }),
          makeEntry({ bikeId: "car-1", kind: "car", name: "Focus", nextDue: null, documentationPct: null }),
        ]}
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        period={null}
      />
    );

    const rows = screen.getAllByText("Not available yet");
    // One for "Due soonest", one for "Documentation" - both for the car column only.
    expect(rows).toHaveLength(2);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    // The bike's own real row is untouched.
    expect(screen.getByText("MOT (due soon)")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("never highlights a car's null documentationPct as the 'Best documented' winner", () => {
    render(
      <ComparisonTable
        entries={[
          makeEntry({ bikeId: "bike-1", documentationPct: 10 }),
          makeEntry({ bikeId: "car-1", kind: "car", nextDue: null, documentationPct: null }),
        ]}
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        period={null}
      />
    );
    // Only one real value exists (10%), so pickWinnerId has nothing to
    // compare it against and highlights no winner at all.
    expect(screen.queryByText("Best documented")).not.toBeInTheDocument();
  });
});
