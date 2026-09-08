// Place at: tests/components/LogLabourForm.test.tsx
//
// LogLabourForm is the "log labour" form. Unlike LogModForm, Labour has
// no separate free-text "what is it?" field - the catalog label itself
// IS the description, so there's a single Category select (with
// optgroups, since LABOUR_GROUPS is single-level like jobTypes.ts's
// JOB_GROUPS, not Mods' deeper subgroup nesting) plus the search box.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogLabourForm } from "@/app/dashboard/LogLabourForm";
import { backdateNotice } from "@/lib/tracker/backdateCheck";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const todayIso = new Date().toISOString().slice(0, 10);

describe("LogLabourForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders real defaults: today's date, the first real category, and the current mileage", () => {
    render(<LogLabourForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    expect(screen.getByLabelText("Date")).toHaveValue(todayIso);
    expect(screen.getByLabelText("Category")).toHaveValue("full-service");
    expect(screen.getByLabelText("Mileage at the time (miles)")).toHaveValue(8000);
  });

  it("the search box's real suggestions jump the Category select to the matched item", async () => {
    const user = userEvent.setup();
    render(<LogLabourForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("Search for a labour job"), "coolant replacement");
    await user.click(screen.getByRole("button", { name: "Coolant replacement" }));

    expect(screen.getByLabelText("Category")).toHaveValue("coolant-replacement");
  });

  it("blocks submit when the mileage is lower than the bike's current mileage for a today-dated entry", async () => {
    const user = userEvent.setup();
    render(<LogLabourForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    const mileageInput = screen.getByLabelText("Mileage at the time (miles)");
    await user.clear(mileageInput);
    await user.type(mileageInput, "100");

    expect(screen.getByText(/can't be lower than the current recorded miles \(8,000 miles\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("a past-dated entry that conflicts with history only blocks until acknowledged", async () => {
    const user = userEvent.setup();
    render(
      <LogLabourForm
        initialMileage={8000}
        mileageHistory={[{ date: "2024-01-01", mileage: 9000 }]}
        distanceUnit="mi"
        currency="GBP"
        rates={null}
      />
    );

    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2024-06-01");

    expect(screen.getByText(/lower than an earlier entry on 1 Jan 2024/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();

    await user.click(screen.getByLabelText("Yes, this mileage is correct"));
    expect(screen.getByRole("button", { name: "Log it" })).toBeEnabled();
  });

  it("shows a non-blocking pre-production note", async () => {
    const user = userEvent.setup();
    render(<LogLabourForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} bikeYear={2020} />);

    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2019-06-01");

    expect(screen.getByText(/before 2020, when this bike was made/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeEnabled();
  });

  it("shows a non-blocking backdate notice for an old, non-conflicting date", async () => {
    const user = userEvent.setup();
    render(<LogLabourForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2020-01-02");

    const expectedNotice = backdateNotice("2020-01-02", new Date().toISOString());
    expect(screen.getByText(new RegExp(expectedNotice))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeEnabled();
  });

  it("submits the real form state to /api/tracker/labour", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogLabourForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("Cost (£)"), "45");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText("Cost (£)");
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/labour",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          category: "full-service",
          cost: 45,
          mileage: 8000,
          date: todayIso,
          notes: "",
          mileageAcknowledged: false,
        }),
      })
    );
  });

  it("clears cost and notes after a successful submit, but keeps the date and category", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogLabourForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("Cost (£)"), "45");
    await user.type(screen.getByLabelText("Notes (optional)"), "Workshop invoice");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText("Cost (£)");
    expect(screen.getByLabelText("Cost (£)")).toHaveValue(null);
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Date")).toHaveValue(todayIso);
    expect(screen.getByLabelText("Category")).toHaveValue("full-service");
  });

  it("shows the server's own error message when the submit fails, and does not reset the form", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Something went wrong logging this labour entry." }) });
    const user = userEvent.setup();
    render(<LogLabourForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("Cost (£)"), "45");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong logging this labour entry.");
    expect(screen.getByLabelText("Cost (£)")).toHaveValue(45);
  });
});
