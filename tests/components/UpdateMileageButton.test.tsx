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

  it("blocks and disables saving when the entered value converts to less than the bike's current recorded mileage", async () => {
    const user = userEvent.setup();
    render(<UpdateMileageButton currentMileage={1000} distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: "Update mileage" }));

    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "500");

    expect(screen.getByText(/can't be lower than your bike's current recorded miles/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saves a valid higher mileage, converting the display value back to miles for the PATCH", async () => {
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

  it("Cancel closes the form without saving", async () => {
    const user = userEvent.setup();
    render(<UpdateMileageButton currentMileage={1000} distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: "Update mileage" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Update mileage" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
