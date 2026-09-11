// Place at: tests/components/UpdateMileageButton.test.tsx
//
// Mileage-update trigger button/modal. Covers the real unit conversion
// (miles stored, mi/km displayed) and the isBlocked guard that stops a
// mileage lower than what's already on record from being saved.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { UpdateMileageButton } from "@/app/dashboard/UpdateMileageButton";

describe("UpdateMileageButton", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens an editable form pre-filled with the current mileage, converted for km display", async () => {
    const user = userEvent.setup();
    render(<UpdateMileageButton currentMileage={1000} distanceUnit="km" />);
    await user.click(screen.getByRole("button", { name: "Update mileage" }));

    // 1000 miles -> ~1609km, rounded.
    expect(screen.getByRole("spinbutton")).toHaveValue(1609);
    expect(screen.getByText("km")).toBeInTheDocument();
  });

  it("blocks and disables saving when the entered value converts to less than the current recorded mileage", async () => {
    const user = userEvent.setup();
    render(<UpdateMileageButton currentMileage={1000} distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: "Update mileage" }));

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "500");

    expect(screen.getByText(/can't be lower than the current recorded miles/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saves a valid higher mileage, converting the display value back to miles for the PATCH, defaulting to the bike endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<UpdateMileageButton currentMileage={1000} distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: "Update mileage" }));

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "1500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ currentMileage: 1500 }) })
    );
  });

  it("PATCHes /api/cars/car instead when vehicleKind is 'car'", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<UpdateMileageButton currentMileage={1000} distanceUnit="mi" vehicleKind="car" />);
    await user.click(screen.getByRole("button", { name: "Update mileage" }));

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "1500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ currentMileage: 1500 }) })
    );
  });

  it("Cancel closes the form without saving", async () => {
    const user = userEvent.setup();
    render(<UpdateMileageButton currentMileage={1000} distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: "Update mileage" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Update mileage" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  // vehicleKind is already threaded through as a prop here (see the
  // "PATCHes /api/cars/car instead" test above), so the spinner just
  // reads that same prop rather than the dashboard's shared context.
  it("shows the bike spinner on 'Save' while the request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<UpdateMileageButton currentMileage={1000} distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: "Update mileage" }));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "1500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button.querySelectorAll("path").length).toBe(0); // bike wheel, not car

    resolveFetch({ ok: true, json: async () => ({}) });
  });

  it("shows the car spinner on 'Save' when vehicleKind is 'car'", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<UpdateMileageButton currentMileage={1000} distanceUnit="mi" vehicleKind="car" />);
    await user.click(screen.getByRole("button", { name: "Update mileage" }));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "1500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button.querySelectorAll("path").length).toBeGreaterThan(0); // car wheel

    resolveFetch({ ok: true, json: async () => ({}) });
  });
});
