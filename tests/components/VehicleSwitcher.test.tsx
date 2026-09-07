// Place at: tests/components/VehicleSwitcher.test.tsx
//
// The sidebar's unified vehicle switcher - replaces BikeSwitcher.tsx,
// generalized to list bikes and cars together (see activeVehicle.ts for
// why a switch needs both a per-kind vehicle-id endpoint AND the shared
// activeVehicleKind cookie each of those endpoints now also sets). Only
// `fetch` and next/navigation's useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { VehicleSwitcher, type SwitcherVehicle } from "@/app/dashboard/VehicleSwitcher";

const bikeA: SwitcherVehicle = { id: "a", kind: "bike", name: "CB500", year: 2019, currentMileage: 8000 };
const carA: SwitcherVehicle = { id: "c", kind: "car", name: "Focus", year: 2020, currentMileage: 40000 };

function openDropdown(container: HTMLElement) {
  return within(container).getByText("Manage vehicles →").closest("div") as HTMLElement;
}

describe("VehicleSwitcher", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing for an empty vehicle list", () => {
    const { container } = render(<VehicleSwitcher vehicles={[]} activeVehicleId="x" distanceUnit="mi" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a single bike renders the static card labelled 'My bike', with no dropdown trigger", () => {
    render(<VehicleSwitcher vehicles={[bikeA]} activeVehicleId="a" distanceUnit="mi" />);
    expect(screen.getByText("My bike")).toBeInTheDocument();
    expect(screen.getByText("CB500")).toBeInTheDocument();
    expect(screen.getByText(/2019.*8,000 miles/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add another vehicle/ })).toHaveAttribute("href", "/garage");
  });

  it("a single car renders the static card labelled 'My car'", () => {
    render(<VehicleSwitcher vehicles={[carA]} activeVehicleId="c" distanceUnit="mi" />);
    expect(screen.getByText("My car")).toBeInTheDocument();
    expect(screen.getByText("Focus")).toBeInTheDocument();
  });

  it("shows 'Custom build' in place of a missing year", () => {
    render(<VehicleSwitcher vehicles={[{ id: "a", kind: "bike", name: "Kit bike", currentMileage: 100 }]} activeVehicleId="a" distanceUnit="mi" />);
    expect(screen.getByText(/Custom build.*100 miles/)).toBeInTheDocument();
  });

  it("falls back to the first vehicle in the list when activeVehicleId matches none of them", () => {
    render(<VehicleSwitcher vehicles={[bikeA, carA]} activeVehicleId="does-not-exist" distanceUnit="mi" />);
    expect(screen.getByRole("button", { name: /My bike/ })).toHaveTextContent("CB500");
  });

  it("a mixed bike+car account renders a collapsed trigger that expands into a dropdown tagging each entry by kind", async () => {
    const user = userEvent.setup();
    const { container } = render(<VehicleSwitcher vehicles={[bikeA, carA]} activeVehicleId="a" distanceUnit="mi" />);
    const trigger = screen.getByRole("button", { name: /My bike/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const dropdown = openDropdown(container);
    expect(within(dropdown).getByText("CB500", { exact: false })).toBeInTheDocument();
    expect(within(dropdown).getByText(/Bike.*2019/)).toBeInTheDocument();
    expect(within(dropdown).getByText("Focus", { exact: false })).toBeInTheDocument();
    expect(within(dropdown).getByText(/Car.*2020/)).toBeInTheDocument();
  });

  it("clicking the already-active vehicle in the dropdown just closes it, with no fetch and no refresh", async () => {
    const user = userEvent.setup();
    const { container } = render(<VehicleSwitcher vehicles={[bikeA, carA]} activeVehicleId="a" distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: /My bike/ }));
    const dropdown = openDropdown(container);
    await user.click(within(dropdown).getByText("CB500", { exact: false }));

    expect(fetch).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText("Manage vehicles →")).not.toBeInTheDocument();
  });

  it("switching to a car posts to /api/cars/active-car with carId, and refreshes on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { container } = render(<VehicleSwitcher vehicles={[bikeA, carA]} activeVehicleId="a" distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: /My bike/ }));
    const dropdown = openDropdown(container);
    await user.click(within(dropdown).getByText("Focus", { exact: false }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/active-car",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ carId: "c" }) })
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("switching to a bike posts to /api/tracker/active-bike with bikeId", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { container } = render(<VehicleSwitcher vehicles={[bikeA, carA]} activeVehicleId="c" distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: /My car/ }));
    const dropdown = openDropdown(container);
    await user.click(within(dropdown).getByText("CB500", { exact: false }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/active-bike",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ bikeId: "a" }) })
    );
  });

  it("a failed switch does not refresh the page and leaves the dropdown open", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    const { container } = render(<VehicleSwitcher vehicles={[bikeA, carA]} activeVehicleId="a" distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: /My bike/ }));
    const dropdown = openDropdown(container);
    await user.click(within(dropdown).getByText("Focus", { exact: false }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(screen.getByText("Manage vehicles →")).toBeInTheDocument();
  });
});
