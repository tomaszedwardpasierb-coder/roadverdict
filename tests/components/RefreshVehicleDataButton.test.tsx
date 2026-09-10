// Place at: tests/components/RefreshVehicleDataButton.test.tsx
//
// DVLA/MOT refresh trigger. Covers the real message-assembly branching
// (which parts get joined, singular vs plural "test(s)") rather than
// just checking a static success string.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RefreshVehicleDataButton } from "@/app/dashboard/RefreshVehicleDataButton";

describe("RefreshVehicleDataButton", () => {
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
    render(<RefreshVehicleDataButton bikeId="bike-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("vehicle data updated, 2 new MOT tests logged.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike/refresh-data",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ bikeId: "bike-1" }) })
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps 'test' singular when exactly one MOT was created", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 1 }),
    });
    const user = userEvent.setup();
    render(<RefreshVehicleDataButton bikeId="bike-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("1 new MOT test logged.")).toBeInTheDocument();
  });

  it("says nothing new when neither part changed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 0 }),
    });
    const user = userEvent.setup();
    render(<RefreshVehicleDataButton bikeId="bike-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("Checked - nothing new to add.")).toBeInTheDocument();
  });

  it("flags a SORN result alongside whatever else changed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 0, sorned: true }),
    });
    const user = userEvent.setup();
    render(<RefreshVehicleDataButton bikeId="bike-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("⚠️ this vehicle is currently SORN (not taxed) - see reminders below.")).toBeInTheDocument();
  });

  // A taxed (non-SORN) vehicle must still get a plain confirmation -
  // otherwise a successful tax check looks identical to one that never
  // ran at all (e.g. no VDG_API_KEY configured).
  it("shows the tax status with its due date when the vehicle is taxed, not just for a SORN result", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 0, sorned: false, taxStatus: "Taxed", taxDueDate: "2027-06-01" }),
    });
    const user = userEvent.setup();
    render(<RefreshVehicleDataButton bikeId="bike-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("tax status: Taxed (due 01/06/2027).")).toBeInTheDocument();
  });

  it("says nothing new when the tax check found nothing to report (taxStatus null)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 0, sorned: false, taxStatus: null, taxDueDate: null }),
    });
    const user = userEvent.setup();
    render(<RefreshVehicleDataButton bikeId="bike-1" available nextAvailableAt={null} />);
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
    render(<RefreshVehicleDataButton bikeId="bike-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("tax status: Taxed (due 01/06/2027), road tax logged as an expense.")).toBeInTheDocument();
  });

  it("shows the server's own error and does not refresh the page", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "DVLA lookup failed." }) });
    const user = userEvent.setup();
    render(<RefreshVehicleDataButton bikeId="bike-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("DVLA lookup failed.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a connection error when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    render(<RefreshVehicleDataButton bikeId="bike-1" available nextAvailableAt={null} />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
  });

  // On cooldown: only ever shows the next-available date, never a
  // disabled button - see bike.ts's canRefreshBikeData.
  it("shows the next-available date instead of a button when on cooldown", () => {
    render(<RefreshVehicleDataButton bikeId="bike-1" available={false} nextAvailableAt="2027-06-05T00:00:00.000Z" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Refresh available again on 05/06/2027.")).toBeInTheDocument();
  });

  it("says 'soon' when on cooldown with no next-available date given", () => {
    render(<RefreshVehicleDataButton bikeId="bike-1" available={false} nextAvailableAt={null} />);

    expect(screen.getByText("Refresh available again soon.")).toBeInTheDocument();
  });
});
