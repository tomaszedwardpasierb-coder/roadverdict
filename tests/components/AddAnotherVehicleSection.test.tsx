// Place at: tests/components/AddAnotherVehicleSection.test.tsx
//
// Replaces AddAnotherBikeSection.test.tsx now that a garage can hold
// both bikes and cars: the same cap-notice/button/form states, plus a
// new "which kind?" step in between the button and the form.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// AddBikeForm/AddCarForm (rendered once a kind is picked) both use the
// shared useTrackerFormSubmit hook, which calls next/navigation's
// useRouter - not exercised by anything AddAnotherVehicleSection itself
// does, but needed just to let either form mount without Next's real
// app router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AddAnotherVehicleSection } from "@/app/garage/AddAnotherVehicleSection";

describe("AddAnotherVehicleSection", () => {
  it("shows the combined free-tier cap notice, with no add button, once vehicleCount reaches maxFreeVehicles", () => {
    render(<AddAnotherVehicleSection vehicleCount={1} maxFreeVehicles={1} />);
    expect(screen.getByText(/Free accounts can track 1 vehicle\. Upgrade to Pro to add another/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add another vehicle/ })).not.toBeInTheDocument();
  });

  it("also shows the cap notice when vehicleCount somehow exceeds the cap", () => {
    render(<AddAnotherVehicleSection vehicleCount={2} maxFreeVehicles={1} />);
    expect(screen.getByText(/Free accounts can track 1 vehicle\./)).toBeInTheDocument();
  });

  it("pluralizes correctly if the free allowance is ever more than one vehicle", () => {
    render(<AddAnotherVehicleSection vehicleCount={2} maxFreeVehicles={2} />);
    expect(screen.getByText(/Free accounts can track 2 vehicles\./)).toBeInTheDocument();
  });

  it("mentions comparing vehicles' running costs as the reason to upgrade, not just the raw limit", () => {
    render(<AddAnotherVehicleSection vehicleCount={1} maxFreeVehicles={1} />);
    expect(screen.getByText(/compare them side by side to see which one actually costs you more to run/)).toBeInTheDocument();
  });

  it("skips the cap notice entirely for a Pro account, even past the cap", () => {
    render(<AddAnotherVehicleSection vehicleCount={5} maxFreeVehicles={1} isPro />);
    expect(screen.queryByText(/Free accounts can track/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add another vehicle" })).toBeInTheDocument();
  });

  it("under the cap, shows the add button instead of the kind picker or either form", () => {
    render(<AddAnotherVehicleSection vehicleCount={0} maxFreeVehicles={1} />);
    expect(screen.getByRole("button", { name: "+ Add another vehicle" })).toBeInTheDocument();
    expect(screen.queryByText(/Free accounts can track/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Motorcycle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Car" })).not.toBeInTheDocument();
  });

  it("clicking the add button asks which kind of vehicle, not the form directly", async () => {
    const user = userEvent.setup();
    render(<AddAnotherVehicleSection vehicleCount={0} maxFreeVehicles={1} />);
    await user.click(screen.getByRole("button", { name: "+ Add another vehicle" }));

    expect(screen.queryByRole("button", { name: "+ Add another vehicle" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Motorcycle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Car" })).toBeInTheDocument();
    expect(document.querySelector("form")).not.toBeInTheDocument();
  });

  it("picking Motorcycle swaps the kind picker for the real AddBikeForm", async () => {
    const user = userEvent.setup();
    render(<AddAnotherVehicleSection vehicleCount={0} maxFreeVehicles={1} />);
    await user.click(screen.getByRole("button", { name: "+ Add another vehicle" }));
    await user.click(screen.getByRole("button", { name: "Motorcycle" }));

    expect(screen.queryByRole("button", { name: "Motorcycle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Car" })).not.toBeInTheDocument();
    // AddBikeForm renders its own submit control - its exact label is
    // covered by AddBikeForm's own tests, so just assert a form appeared.
    expect(document.querySelector("form")).toBeInTheDocument();
  });

  it("picking Car swaps the kind picker for the real AddCarForm", async () => {
    const user = userEvent.setup();
    render(<AddAnotherVehicleSection vehicleCount={0} maxFreeVehicles={1} />);
    await user.click(screen.getByRole("button", { name: "+ Add another vehicle" }));
    await user.click(screen.getByRole("button", { name: "Car" }));

    expect(screen.queryByRole("button", { name: "Motorcycle" })).not.toBeInTheDocument();
    expect(document.querySelector("form")).toBeInTheDocument();
    // AddCarForm-specific field, to confirm it's genuinely the car form
    // and not AddBikeForm rendered by mistake.
    expect(screen.getByLabelText("Fuel type")).toBeInTheDocument();
  });
});
