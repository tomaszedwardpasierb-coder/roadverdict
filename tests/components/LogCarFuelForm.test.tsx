// Place at: tests/components/LogCarFuelForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogCarFuelForm } from "@/app/dashboard/LogCarFuelForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const todayIso = new Date().toISOString().slice(0, 10);

describe("LogCarFuelForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("for a petrol car, shows a litres field and the 'filled to full' checkbox, defaulted checked", () => {
    render(<LogCarFuelForm fuelType="petrol" initialMileage={40000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.getByLabelText("Litres added")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Energy added/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Filled the tank completely full")).toBeChecked();
  });

  it("for an electric car, shows a kWh field and no 'filled to full' checkbox", () => {
    render(<LogCarFuelForm fuelType="electric" initialMileage={40000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.getByLabelText(/Energy added/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Litres added")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filled the tank completely full")).not.toBeInTheDocument();
  });

  it("blocks submit when the mileage is lower than the car's current mileage", async () => {
    const user = userEvent.setup();
    render(<LogCarFuelForm fuelType="petrol" initialMileage={40000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    const mileageInput = screen.getByLabelText("Mileage at the time (miles)");
    await user.clear(mileageInput);
    await user.type(mileageInput, "100");
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("submits litres for a petrol car, to /api/cars/car-fuel", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogCarFuelForm fuelType="petrol" initialMileage={40000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("Litres added"), "45");
    await user.type(screen.getByLabelText(/Cost paid/), "60");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText(/Cost paid/);
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-fuel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          litres: 45,
          kwh: undefined,
          cost: 60,
          mileage: 40000,
          date: todayIso,
          filledToFull: true,
          mileageAcknowledged: false,
        }),
      })
    );
  });

  it("submits kwh (never litres) for an electric car", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogCarFuelForm fuelType="electric" initialMileage={40000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText(/Energy added/), "30");
    await user.type(screen.getByLabelText(/Cost paid/), "12");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText(/Cost paid/);
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-fuel",
      expect.objectContaining({
        body: JSON.stringify({
          litres: undefined,
          kwh: 30,
          cost: 12,
          mileage: 40000,
          date: todayIso,
          filledToFull: undefined,
          mileageAcknowledged: false,
        }),
      })
    );
  });
});
