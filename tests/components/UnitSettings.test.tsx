// Place at: tests/components/UnitSettings.test.tsx
//
// Distance/fuel-economy/currency unit picker. Only fetch and
// next/navigation's useRouter (via useTrackerFormSubmit) are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { UnitSettings } from "@/app/dashboard/UnitSettings";

describe("UnitSettings", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts collapsed, summarising the current units", () => {
    render(<UnitSettings distanceUnit="mi" fuelEconomyUnit="mpg" currency="GBP" />);
    expect(screen.getByRole("button", { name: "Units: Miles / MPG / GBP" })).toBeInTheDocument();
  });

  it("expands into an editable form, and submits the changed units as a PATCH", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<UnitSettings distanceUnit="mi" fuelEconomyUnit="mpg" currency="GBP" />);

    await user.click(screen.getByRole("button", { name: "Units: Miles / MPG / GBP" }));
    await user.selectOptions(screen.getByLabelText("Distance"), "km");
    await user.selectOptions(screen.getByLabelText("Currency"), "EUR");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ distanceUnit: "km", fuelEconomyUnit: "mpg", currency: "EUR" }),
      })
    );
  });

  it("PATCHes /api/cars/car instead of /api/tracker/bike when vehicleKind is 'car'", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<UnitSettings distanceUnit="mi" fuelEconomyUnit="mpg" currency="GBP" vehicleKind="car" />);

    await user.click(screen.getByRole("button", { name: "Units: Miles / MPG / GBP" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetch).toHaveBeenCalledWith("/api/cars/car", expect.objectContaining({ method: "PATCH" }));
  });

  it("warns that currency changes only affect display, once a different currency is picked", async () => {
    const user = userEvent.setup();
    render(<UnitSettings distanceUnit="mi" fuelEconomyUnit="mpg" currency="GBP" />);
    await user.click(screen.getByRole("button", { name: "Units: Miles / MPG / GBP" }));

    expect(screen.queryByText(/one-time, permanent choice/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Currency"), "PLN");
    expect(screen.getByText(/one-time, permanent choice/)).toBeInTheDocument();
  });

  it("Cancel collapses the form back to the summary button without submitting", async () => {
    const user = userEvent.setup();
    render(<UnitSettings distanceUnit="mi" fuelEconomyUnit="mpg" currency="GBP" />);
    await user.click(screen.getByRole("button", { name: "Units: Miles / MPG / GBP" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Units: Miles / MPG / GBP" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Cancel reverts any edited-but-unsaved selections, so reopening shows the original units again", async () => {
    const user = userEvent.setup();
    render(<UnitSettings distanceUnit="mi" fuelEconomyUnit="mpg" currency="GBP" />);
    await user.click(screen.getByRole("button", { name: "Units: Miles / MPG / GBP" }));
    await user.selectOptions(screen.getByLabelText("Distance"), "km");
    await user.selectOptions(screen.getByLabelText("Currency"), "EUR");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Units: Miles / MPG / GBP" }));
    expect(screen.getByLabelText("Distance")).toHaveValue("mi");
    expect(screen.getByLabelText("Currency")).toHaveValue("GBP");
  });

  // vehicleKind is already threaded through as a prop here (see the
  // PATCHes-the-right-endpoint test above), so the spinner just reads
  // that same prop rather than the dashboard's shared context.
  it("shows the bike spinner on 'Save' while the request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<UnitSettings distanceUnit="mi" fuelEconomyUnit="mpg" currency="GBP" />);
    await user.click(screen.getByRole("button", { name: "Units: Miles / MPG / GBP" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button.querySelectorAll("path").length).toBe(0); // bike wheel, not car

    resolveFetch({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Saving…" })).not.toBeInTheDocument());
  });

  it("shows the car spinner on 'Save' when vehicleKind is 'car'", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<UnitSettings distanceUnit="mi" fuelEconomyUnit="mpg" currency="GBP" vehicleKind="car" />);
    await user.click(screen.getByRole("button", { name: "Units: Miles / MPG / GBP" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button.querySelectorAll("path").length).toBeGreaterThan(0); // car wheel

    resolveFetch({ ok: true, json: async () => ({}) });
  });
});
