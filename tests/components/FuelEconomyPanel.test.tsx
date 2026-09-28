// Place at: tests/components/FuelEconomyPanel.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FuelEconomyPanel } from "@/app/dashboard/FuelEconomyPanel";

const summary = {
  averageMpg: 52,
  trustedTanks: 14,
  lastTank: { miles: 212, litres: 18.4, mpg: 52.4, date: "2026-09-12" },
  lastPrice: { perLitre: 1.489, date: "2026-09-12" },
};

describe("FuelEconomyPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the owner's average, last tank and cost per mile, in their units", () => {
    render(<FuelEconomyPanel vehicleKind="bike" summary={summary} officialMpg={64.2} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" preferredFuel="petrol" />);
    expect(screen.getByText("52.0 mpg")).toBeInTheDocument();
    expect(screen.getByText("from 14 full tanks")).toBeInTheDocument();
    expect(screen.getByText(/212 mi on 18\.4 L · 12 Sept/)).toBeInTheDocument();
    // 148.9p x 4.546 / 52 mpg
    expect(screen.getByText("13.0p")).toBeInTheDocument();
    expect(screen.getByText(/official combined figure for this exact bike is 64\.2 mpg/)).toBeInTheDocument();
  });

  it("uses L/100km, km and the owner's currency when that's what they've chosen", () => {
    render(<FuelEconomyPanel vehicleKind="car" summary={summary} officialMpg={null} fuelEconomyUnit="l100km" distanceUnit="km" currency="EUR" preferredFuel="diesel" />);
    expect(screen.getAllByText("5.4 L/100km")).toHaveLength(2);
    expect(screen.getByText(/341 km on 18\.4 L/)).toBeInTheDocument();
    expect(screen.getByText("Fuel per 100 km")).toBeInTheDocument();
    expect(screen.getByText("€8.09")).toBeInTheDocument();
  });

  it("explains what's missing before two full tanks", () => {
    render(<FuelEconomyPanel vehicleKind="car" summary={{ averageMpg: null, trustedTanks: 0, lastTank: null, lastPrice: null }} officialMpg={null} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" preferredFuel="petrol" />);
    expect(screen.getByText(/Log two full-tank fill-ups in a row/)).toBeInTheDocument();
  });

  it("opens the calculator started from the last tank and last price", async () => {
    const user = userEvent.setup();
    render(<FuelEconomyPanel vehicleKind="bike" summary={summary} officialMpg={null} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" preferredFuel="petrol" />);
    expect(screen.queryByLabelText("Miles driven")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Work out a tank" }));
    expect(screen.getByLabelText("Miles driven")).toHaveValue("212");
    expect(screen.getByLabelText("Price per litre (pence)")).toHaveValue("148.9");
    expect(screen.getByRole("button", { name: "Close the calculator" })).toHaveAttribute("aria-expanded", "true");
  });
});
