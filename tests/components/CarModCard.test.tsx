// Place at: tests/components/CarModCard.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarModCard } from "@/app/dashboard/CarModCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const mod = {
  id: "car-1::carMod::1", pk: "x", type: "carMod" as const, carId: "car-1",
  category: "dash-cam", name: "Nextbase 622GW", cost: 150, mileage: 42000,
  notes: "Front and rear", date: "2025-06-01", createdAt: "2025-06-01T00:00:00.000Z",
} as any;

describe("CarModCard", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("shows the real name, category label, cost, and notes", () => {
    render(<CarModCard mod={mod} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.getByText("Nextbase 622GW")).toBeInTheDocument();
    expect(screen.getByText(/Dash cam/)).toBeInTheDocument();
    expect(screen.getByText("£150.00")).toBeInTheDocument();
    expect(screen.getByText("Front and rear")).toBeInTheDocument();
  });

  it("Edit opens a pre-filled form, and Save PATCHes the real endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarModCard mod={mod} distanceUnit="mi" currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("What is it?")).toHaveValue("Nextbase 622GW");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-mods/car-1::carMod::1", expect.objectContaining({ method: "PATCH" }));
  });

  it("Delete sends a real DELETE once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarModCard mod={mod} distanceUnit="mi" currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-mods/car-1::carMod::1", expect.objectContaining({ method: "DELETE" }));
  });
});
