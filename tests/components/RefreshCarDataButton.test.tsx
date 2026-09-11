// Place at: tests/components/RefreshCarDataButton.test.tsx
// Car equivalent of RefreshVehicleDataButton.test.tsx - same coverage,
// posting carId to the car refresh-data route.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RefreshCarDataButton } from "@/app/dashboard/RefreshCarDataButton";

describe("RefreshCarDataButton", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("combines both parts, pluralising 'tests' when more than one MOT was created", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: true, motCreated: 2 }),
    });
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("vehicle data updated, 2 new MOT tests logged.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car/refresh-data",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ carId: "car-1" }) })
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps 'test' singular when exactly one MOT was created", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 1 }),
    });
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("1 new MOT test logged.")).toBeInTheDocument();
  });

  it("says nothing new when nothing changed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 0 }),
    });
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("Checked - nothing new to add.")).toBeInTheDocument();
  });

  it("flags a SORN result alongside whatever else changed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 0, sorned: true }),
    });
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("⚠️ this car is currently SORN (not taxed) - see reminders below.")).toBeInTheDocument();
  });

  // A taxed (non-SORN) vehicle must still get a plain confirmation - see
  // the bike button's own equivalent test for why.
  it("shows the tax status with its due date when the car is taxed, not just for a SORN result", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 0, sorned: false, taxStatus: "Taxed", taxDueDate: "2027-06-01" }),
    });
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("tax status: Taxed (due 01/06/2027).")).toBeInTheDocument();
  });

  it("says nothing new when the tax check found nothing to report (taxStatus null)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 0, sorned: false, taxStatus: null, taxDueDate: null }),
    });
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("Checked - nothing new to add.")).toBeInTheDocument();
  });

  it("mentions the road-tax bill being logged alongside the tax status", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        dvlaRefreshed: false,
        motCreated: 0,
        sorned: false,
        taxStatus: "Taxed",
        taxDueDate: "2027-06-01",
        taxBillLogged: true,
      }),
    });
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("tax status: Taxed (due 01/06/2027), road tax logged as an expense.")).toBeInTheDocument();
  });

  it("shows the server's own error and does not refresh the page", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "DVLA lookup failed." }) });
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("DVLA lookup failed.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a connection error when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
  });

  it("shows the next-available date instead of a button when on cooldown", () => {
    render(<RefreshCarDataButton carId="car-1" available={false} nextAvailableAt="2027-06-05T00:00:00.000Z" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Refresh available again on 05/06/2027.")).toBeInTheDocument();
  });

  it("says 'soon' when on cooldown with no next-available date given", () => {
    render(<RefreshCarDataButton carId="car-1" available={false} nextAvailableAt={null} />);

    expect(screen.getByText("Refresh available again soon.")).toBeInTheDocument();
  });

  // Pins the actual visual feedback this was built for - a button click
  // that's accepted but takes a moment shouldn't read as "did nothing
  // happen?" (see VehicleSpinner.tsx).
  it("shows the car spinner alongside the button's own 'Refreshing…' text while the request is in flight", async () => {
    let resolveFetch: (value: unknown) => void;
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" available nextAvailableAt={null} />);

    const button = screen.getByRole("button", { name: "Refresh vehicle data" });
    await user.click(button);

    expect(await screen.findByText("Refreshing…")).toBeInTheDocument();
    expect(button.querySelector("svg")).toBeInTheDocument();

    resolveFetch!({ ok: true, json: async () => ({ dvlaRefreshed: false, motCreated: 0 }) });
    expect(await screen.findByText("Checked - nothing new to add.")).toBeInTheDocument();
    expect(button.querySelector("svg")).not.toBeInTheDocument();
  });
});
