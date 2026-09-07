// Place at: tests/components/LogCarServiceForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogCarServiceForm } from "@/app/dashboard/LogCarServiceForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const todayIso = new Date().toISOString().slice(0, 10);

describe("LogCarServiceForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders real defaults: today's date, oil-filter, the current mileage, and its own remind default checked", () => {
    render(<LogCarServiceForm initialMileage={40000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.getByLabelText("Date")).toHaveValue(todayIso);
    expect(screen.getByLabelText("Job")).toHaveValue("oil-filter");
    expect(screen.getByLabelText("Mileage at the time (miles)")).toHaveValue(40000);
    expect(screen.getByLabelText(/Remind me when this is due again/)).toBeChecked();
  });

  it("switching to a job with no reminder default (Other) unchecks remind automatically", async () => {
    const user = userEvent.setup();
    render(<LogCarServiceForm initialMileage={40000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    await user.selectOptions(screen.getByLabelText("Job"), "other");
    expect(screen.getByLabelText(/Remind me when this is due again/)).not.toBeChecked();
  });

  it("blocks submit when the mileage is lower than the car's current mileage for a today-dated entry", async () => {
    const user = userEvent.setup();
    render(<LogCarServiceForm initialMileage={40000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    const mileageInput = screen.getByLabelText("Mileage at the time (miles)");
    await user.clear(mileageInput);
    await user.type(mileageInput, "100");
    expect(screen.getByText(/can't be lower than the current recorded miles \(40,000 miles\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("blocks submit and shows a specific error for a date before the car's own production year", async () => {
    const user = userEvent.setup();
    render(<LogCarServiceForm initialMileage={40000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} carYear={2020} />);
    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2019-06-01");
    expect(await screen.findByRole("alert")).toHaveTextContent(/before 2020, when this car was made/);
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("submits the real form state, including the default reminder, to /api/cars/car-services", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogCarServiceForm initialMileage={40000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText(/Cost paid/), "80");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText(/Cost paid/);
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-services",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          jobType: "oil-filter",
          cost: 80,
          mileage: 40000,
          date: todayIso,
          notes: "",
          mileageAcknowledged: false,
          reminder: { intervalType: "mileage", intervalValue: 10000, additionalTriggers: [] },
        }),
      })
    );
  });

  it("shows the server's own error message when the submit fails, and does not reset the form", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Something went wrong." }) });
    const user = userEvent.setup();
    render(<LogCarServiceForm initialMileage={40000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText(/Cost paid/), "80");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(screen.getByLabelText(/Cost paid/)).toHaveValue(80);
  });
});
