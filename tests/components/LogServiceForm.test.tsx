// Place at: tests/components/LogServiceForm.test.tsx
//
// LogServiceForm is the "log a service" form: real mileage-consistency
// and production-year/backdate checks (mileageCheck.ts,
// productionYearCheck.ts, backdateCheck.ts) gate the real submit, and a
// real useTrackerFormSubmit posts to /api/tracker/services. Only fetch
// and next/navigation's useRouter (used inside useTrackerFormSubmit) are
// mocked - the rest, including which of these checks actually blocks
// submission, runs for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogServiceForm } from "@/app/dashboard/LogServiceForm";
import { backdateNotice } from "@/lib/tracker/backdateCheck";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const todayIso = new Date().toISOString().slice(0, 10);

describe("LogServiceForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders real defaults: today's date, basic-service, the current mileage, and its own remind default checked", () => {
    render(<LogServiceForm initialMileage={5000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    expect(screen.getByLabelText("Date")).toHaveValue(todayIso);
    expect(screen.getByLabelText("Job")).toHaveValue("basic-service");
    expect(screen.getByLabelText("Mileage at the time (miles)")).toHaveValue(5000);
    expect(screen.getByLabelText(/Remind me when this is due again/)).toBeChecked();
  });

  it("pre-fills an interpolated mileage estimate, with a note, when a past date is picked between two logged points", async () => {
    const user = userEvent.setup();
    render(
      <LogServiceForm
        initialMileage={5000} startingMileage={0} dateAdded="2020-01-01"
        mileageHistory={[{ date: "2024-01-01", mileage: 4000 }, { date: "2024-03-01", mileage: 4600 }]}
        distanceUnit="mi"
        currency="GBP"
        rates={null}
      />
    );

    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2024-02-01");

    // 31 of the 60 days between the two bracketing points (2024 is a leap
    // year, so Jan has 31 days and Feb has 29) - 4000 + 31/60 * 600 = 4310.
    expect(screen.getByLabelText("Mileage at the time (miles)")).toHaveValue(4310);
    expect(screen.getByText(/Mileage interpolated between logged records for this date/)).toBeInTheDocument();
  });

  it("stops overwriting mileage with a new estimate once the person has typed their own figure", async () => {
    const user = userEvent.setup();
    render(
      <LogServiceForm
        initialMileage={5000} startingMileage={0} dateAdded="2020-01-01"
        mileageHistory={[{ date: "2024-01-01", mileage: 4000 }, { date: "2024-03-01", mileage: 4600 }]}
        distanceUnit="mi"
        currency="GBP"
        rates={null}
      />
    );

    const dateInput = screen.getByLabelText("Date");
    const mileageInput = screen.getByLabelText("Mileage at the time (miles)");
    await user.clear(dateInput);
    await user.type(dateInput, "2024-02-01");
    expect(mileageInput).toHaveValue(4310);

    await user.clear(mileageInput);
    await user.type(mileageInput, "4250");
    expect(screen.queryByText(/Mileage interpolated/)).not.toBeInTheDocument();

    // Changing the date again must not silently override what was just typed.
    await user.clear(dateInput);
    await user.type(dateInput, "2024-01-15");
    expect(mileageInput).toHaveValue(4250);
  });

  it("leaves the field on the current mileage, with a please-check-yourself note, when a date is too far outside any trustable range", async () => {
    const user = userEvent.setup();
    render(<LogServiceForm initialMileage={5000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    // More than a thousand days before dateAdded - well past the (capped)
    // 730-day trusted-extrapolation window, so this must ask rather than guess.
    await user.type(dateInput, "2017-01-01");

    expect(screen.getByLabelText("Mileage at the time (miles)")).toHaveValue(5000);
    expect(screen.getByText(/too far to trust a guess/)).toBeInTheDocument();
    expect(screen.getByText(/please enter the real mileage if you know it/)).toBeInTheDocument();
  });

  it("switching to a job with no reminder default (Other) unchecks remind automatically", async () => {
    const user = userEvent.setup();
    render(<LogServiceForm initialMileage={5000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.selectOptions(screen.getByLabelText("Job"), "other");
    expect(screen.getByLabelText(/Remind me when this is due again/)).not.toBeChecked();
  });

  it("blocks submit when the mileage is lower than the bike's current mileage for a today-dated entry", async () => {
    const user = userEvent.setup();
    render(<LogServiceForm initialMileage={5000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    const mileageInput = screen.getByLabelText("Mileage at the time (miles)");
    await user.clear(mileageInput);
    await user.type(mileageInput, "100");

    expect(screen.getByText(/can't be lower than the current recorded miles \(5,000 miles\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("a past-dated entry that conflicts with history only blocks until acknowledged", async () => {
    const user = userEvent.setup();
    render(
      <LogServiceForm
        initialMileage={5000} startingMileage={0} dateAdded="2020-01-01"
        mileageHistory={[{ date: "2024-01-01", mileage: 6000 }]}
        distanceUnit="mi"
        currency="GBP"
        rates={null}
      />
    );

    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2024-06-01");

    // Changing only the date, without touching mileage, now auto-corrects
    // the mileage estimate to stay consistent with the logged history
    // above (see useEstimatedMileage) - so the conflict below has to come
    // from a mileage the person actually typed themselves, same as
    // someone entering a real figure from a receipt or their own memory.
    const mileageInput = screen.getByLabelText(/Mileage at the time/);
    await user.clear(mileageInput);
    await user.type(mileageInput, "5000");

    expect(screen.getByText(/lower than an earlier entry on 1 Jan 2024/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();

    await user.click(screen.getByLabelText("Yes, this mileage is correct"));
    expect(screen.getByRole("button", { name: "Log it" })).toBeEnabled();
  });

  it("blocks submit and shows a specific error for a date before the bike's own production year", async () => {
    const user = userEvent.setup();
    render(<LogServiceForm initialMileage={5000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} bikeYear={2020} />);

    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2019-06-01");

    expect(await screen.findByRole("alert")).toHaveTextContent(/before 2020, when this bike was made/);
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("shows a non-blocking backdate notice for an old, non-conflicting date", async () => {
    const user = userEvent.setup();
    render(<LogServiceForm initialMileage={5000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2020-01-02");

    const expectedNotice = backdateNotice("2020-01-02", new Date().toISOString());
    expect(screen.getByText(new RegExp(expectedNotice))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeEnabled();
  });

  it("submits the real form state, including the default reminder, to /api/tracker/services", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogServiceForm initialMileage={5000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("Cost paid (£)"), "150");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText("Cost paid (£)");
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/services",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          jobType: "basic-service",
          cost: 150,
          mileage: 5000,
          date: todayIso,
          notes: "",
          mileageAcknowledged: false,
          reminder: { intervalType: "mileage", intervalValue: 4000 },
        }),
      })
    );
  });

  it("clears cost and notes, but keeps the date, after a successful submit", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogServiceForm initialMileage={5000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("Cost paid (£)"), "150");
    await user.type(screen.getByLabelText("Notes (optional)"), "front only");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText("Cost paid (£)");
    expect(screen.getByLabelText("Cost paid (£)")).toHaveValue(null);
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Date")).toHaveValue(todayIso);
  });

  it("shows the server's own error message when the submit fails, and does not reset the form", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Something went wrong logging this service." }) });
    const user = userEvent.setup();
    render(<LogServiceForm initialMileage={5000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("Cost paid (£)"), "150");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong logging this service.");
    expect(screen.getByLabelText("Cost paid (£)")).toHaveValue(150);
  });

  it("shows the job-specific reminder note (e.g. valve clearance varies hugely by bike) when that job is selected", async () => {
    const user = userEvent.setup();
    render(<LogServiceForm initialMileage={5000} startingMileage={0} dateAdded="2020-01-01" mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.selectOptions(screen.getByLabelText("Job"), "valve-clearance");
    expect(screen.getByText(/Varies hugely by bike \(6,000-25,000\+ mi\)/)).toBeInTheDocument();
  });
});
