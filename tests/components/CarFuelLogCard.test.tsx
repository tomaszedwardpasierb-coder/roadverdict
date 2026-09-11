// Place at: tests/components/CarFuelLogCard.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarFuelLogCard } from "@/app/dashboard/CarFuelLogCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const petrolLog = {
  id: "car-1::carFuel::1", pk: "x", type: "carFuel" as const, carId: "car-1", fuelType: "petrol",
  litres: 45, cost: 60, mileage: 42000, filledToFull: true, date: "2025-06-01", createdAt: "2025-06-01T00:00:00.000Z",
} as any;
const electricLog = { ...petrolLog, fuelType: "electric", litres: undefined, kwh: 30, filledToFull: undefined };

describe("CarFuelLogCard", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("shows litres and 'full tank' for a petrol log", () => {
    render(<CarFuelLogCard log={petrolLog} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.getByText("45.0L (full tank)")).toBeInTheDocument();
    expect(screen.getByText("£60.00")).toBeInTheDocument();
  });

  it("shows kWh, never litres, for an electric log", () => {
    render(<CarFuelLogCard log={electricLog} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.getByText("30.0 kWh")).toBeInTheDocument();
  });

  it("Edit opens a pre-filled kWh field for an electric log, with no 'filled to full' checkbox", async () => {
    const user = userEvent.setup();
    render(<CarFuelLogCard log={electricLog} distanceUnit="mi" currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/Energy added/)).toHaveValue(30);
    expect(screen.queryByLabelText("Filled the tank completely full")).not.toBeInTheDocument();
  });

  it("Save PATCHes litres (not kwh) for a petrol log", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarFuelLogCard log={petrolLog} distanceUnit="mi" currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-fuel/car-1::carFuel::1",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"litres":45') })
    );
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.kwh).toBeUndefined();
  });

  it("Delete sends a real DELETE once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarFuelLogCard log={petrolLog} distanceUnit="mi" currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-fuel/car-1::carFuel::1", expect.objectContaining({ method: "DELETE" }));
  });
});
