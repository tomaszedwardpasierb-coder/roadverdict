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
    render(<RefreshCarDataButton carId="car-1" />);
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
    render(<RefreshCarDataButton carId="car-1" />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("1 new MOT test logged.")).toBeInTheDocument();
  });

  it("says nothing new when nothing changed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 0 }),
    });
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("Checked - nothing new to add.")).toBeInTheDocument();
  });

  it("flags a SORN result alongside whatever else changed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ dvlaRefreshed: false, motCreated: 0, sorned: true }),
    });
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("⚠️ this car is currently SORN (not taxed) - see reminders below.")).toBeInTheDocument();
  });

  it("shows the server's own error and does not refresh the page", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "DVLA lookup failed." }) });
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("DVLA lookup failed.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a connection error when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    render(<RefreshCarDataButton carId="car-1" />);
    await user.click(screen.getByRole("button", { name: "Refresh vehicle data" }));

    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
  });
});
