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

  // Deliberately reads the row's OWN kind (v.kind), not the dashboard's
  // active-vehicle context - switching bike->car should show the car
  // wheel for the row being switched TO while it's in flight, not the
  // bike wheel from whatever was active before the click.
  it("shows the car spinner only on the row being switched to, while the switch is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    const { container } = render(<VehicleSwitcher vehicles={[bikeA, carA]} activeVehicleId="a" distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: /My bike/ }));
    const dropdown = openDropdown(container);
    const carRow = within(dropdown).getByText("Focus", { exact: false }).closest("button") as HTMLButtonElement;
    const bikeRow = within(dropdown).getByText("CB500", { exact: false }).closest("button") as HTMLButtonElement;
    await user.click(carRow);

    expect(carRow.querySelector("svg")).toBeInTheDocument();
    expect(carRow.querySelectorAll("path").length).toBeGreaterThan(0); // car wheel
    // The other row is disabled too (one switch at a time), but shows no
    // spinner of its own - it isn't the one being switched to.
    expect(bikeRow).toBeDisabled();
    expect(bikeRow.querySelector("svg")).not.toBeInTheDocument();

    resolveFetch({ ok: true });
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("shows the bike spinner on the row being switched to when switching from a car to a bike", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    const { container } = render(<VehicleSwitcher vehicles={[bikeA, carA]} activeVehicleId="c" distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: /My car/ }));
    const dropdown = openDropdown(container);
    const bikeRow = within(dropdown).getByText("CB500", { exact: false }).closest("button") as HTMLButtonElement;
    await user.click(bikeRow);

    expect(bikeRow.querySelector("svg")).toBeInTheDocument();
    expect(bikeRow.querySelectorAll("path").length).toBe(0); // bike wheel, not car

    resolveFetch({ ok: true });
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
