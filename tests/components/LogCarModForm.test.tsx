// Place at: tests/components/LogCarModForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogCarModForm } from "@/app/dashboard/LogCarModForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const todayIso = new Date().toISOString().slice(0, 10);

describe("LogCarModForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the first car mod category by default, with today's date and current mileage", () => {
    render(<LogCarModForm initialMileage={40000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.getByLabelText("Category")).toHaveValue("dash-cam");
    expect(screen.getByLabelText("Date")).toHaveValue(todayIso);
    expect(screen.getByLabelText("Mileage at the time (miles)")).toHaveValue(40000);
  });

  it("does not block a date before the car's production year - only a soft note", async () => {
    const user = userEvent.setup();
    render(<LogCarModForm initialMileage={40000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} carYear={2020} />);
    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2019-06-01");
    expect(screen.getByText(/dated before 2020/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocks submit when the mileage is lower than the car's current mileage", async () => {
    const user = userEvent.setup();
    render(<LogCarModForm initialMileage={40000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    const mileageInput = screen.getByLabelText("Mileage at the time (miles)");
    await user.clear(mileageInput);
    await user.type(mileageInput, "100");
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("submits the real form state to /api/cars/car-mods", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogCarModForm initialMileage={40000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("What is it?"), "Nextbase 622GW");
    await user.type(screen.getByLabelText(/Cost paid/), "150");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText(/Cost paid/);
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-mods",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          category: "dash-cam",
          name: "Nextbase 622GW",
          cost: 150,
          mileage: 40000,
          date: todayIso,
          notes: "",
          mileageAcknowledged: false,
        }),
      })
    );
  });
});
