// Place at: tests/components/LogCarLabourForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogCarLabourForm } from "@/app/dashboard/LogCarLabourForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const todayIso = new Date().toISOString().slice(0, 10);

describe("LogCarLabourForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the first car labour category by default, with today's date and current mileage", () => {
    render(<LogCarLabourForm initialMileage={40000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.getByLabelText("Category")).not.toHaveValue("");
    expect(screen.getByLabelText("Date")).toHaveValue(todayIso);
    expect(screen.getByLabelText("Mileage at the time (miles)")).toHaveValue(40000);
  });

  it("the search box's real suggestions jump the Category select to the matched item", async () => {
    const user = userEvent.setup();
    render(<LogCarLabourForm initialMileage={40000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("Search for a labour job"), "coolant replacement");
    await user.click(screen.getByRole("button", { name: "Coolant replacement" }));

    expect(screen.getByLabelText("Category")).toHaveValue("coolant-replacement");
  });

  it("does not block a date before the car's production year - only a soft note", async () => {
    const user = userEvent.setup();
    render(<LogCarLabourForm initialMileage={40000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} carYear={2020} />);
    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2019-06-01");
    expect(screen.getByText(/before 2020, when this car was made/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeEnabled();
  });

  it("blocks submit when the mileage is lower than the car's current mileage", async () => {
    const user = userEvent.setup();
    render(<LogCarLabourForm initialMileage={40000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    const mileageInput = screen.getByLabelText("Mileage at the time (miles)");
    await user.clear(mileageInput);
    await user.type(mileageInput, "100");
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("submits the real form state to /api/cars/car-labour", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogCarLabourForm initialMileage={40000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("Search for a labour job"), "coolant replacement");
    await user.click(screen.getByRole("button", { name: "Coolant replacement" }));
    await user.type(screen.getByLabelText(/Cost/), "60");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText(/Cost/);
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-labour",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          category: "coolant-replacement",
          cost: 60,
          mileage: 40000,
          date: todayIso,
          notes: "",
          mileageAcknowledged: false,
        }),
      })
    );
  });
});
