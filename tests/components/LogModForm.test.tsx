// Place at: tests/components/LogModForm.test.tsx
//
// LogModForm is the "log a part or accessory" form. It shares the same
// mileage-consistency machinery as LogServiceForm, but deliberately
// treats a pre-production date differently: it's shown as a plain
// (non-blocking) note here, since gear is often bought before a bike
// is delivered, whereas LogServiceForm blocks on it outright - that
// real difference is worth pinning down, not just re-testing the same
// mileage logic twice. Only fetch and next/navigation's useRouter are
// mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogModForm } from "@/app/dashboard/LogModForm";
import { backdateNotice } from "@/lib/tracker/backdateCheck";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const todayIso = new Date().toISOString().slice(0, 10);

describe("LogModForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders real defaults: today's date, the first real group/category, and the current mileage", () => {
    render(<LogModForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    expect(screen.getByLabelText("Date")).toHaveValue(todayIso);
    expect(screen.getByLabelText("Group")).toHaveValue("Performance & exhaust");
    expect(screen.getByLabelText("Category")).toHaveValue("exhaust-headers");
    expect(screen.getByLabelText("Mileage at the time (miles)")).toHaveValue(8000);
  });

  it("changing Group resets Category to that group's own first item", async () => {
    const user = userEvent.setup();
    render(<LogModForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.selectOptions(screen.getByLabelText("Group"), "Styling & protection");
    expect(screen.getByLabelText("Category")).toHaveValue("tank-pads");
  });

  it("the search box's real suggestions jump both Group and Category to the matched item", async () => {
    const user = userEvent.setup();
    render(<LogModForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("Search for an item"), "tank bag");
    await user.click(screen.getByRole("button", { name: "Tank bag" }));

    expect(screen.getByLabelText("Category")).toHaveValue("tank-bag");
    expect(screen.getByLabelText("Group")).toHaveValue("Comfort & practicality");
  });

  it("blocks submit when the mileage is lower than the bike's current mileage for a today-dated entry", async () => {
    const user = userEvent.setup();
    render(<LogModForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    const mileageInput = screen.getByLabelText("Mileage at the time (miles)");
    await user.clear(mileageInput);
    await user.type(mileageInput, "100");

    expect(screen.getByText(/can't be lower than your bike's current recorded miles \(8,000 miles\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("a past-dated entry that conflicts with history only blocks until acknowledged", async () => {
    const user = userEvent.setup();
    render(
      <LogModForm
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

  it("shows a pre-production note but does NOT block submit, unlike LogServiceForm's hard block", async () => {
    const user = userEvent.setup();
    render(<LogModForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} bikeYear={2020} />);

    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2019-06-01");

    expect(screen.getByText(/before 2020, when this bike was made/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeEnabled();
  });

  it("shows a non-blocking backdate notice for an old, non-conflicting date", async () => {
    const user = userEvent.setup();
    render(<LogModForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2020-01-02");

    const expectedNotice = backdateNotice("2020-01-02", new Date().toISOString());
    expect(screen.getByText(new RegExp(expectedNotice))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeEnabled();
  });

  it("submits the real form state to /api/tracker/mods", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogModForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("What is it?"), "Akrapovic slip-on can");
    await user.type(screen.getByLabelText("Cost (£)"), "450");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText("What is it?");
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/mods",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          category: "exhaust-headers",
          name: "Akrapovic slip-on can",
          cost: 450,
          mileage: 8000,
          date: todayIso,
          notes: "",
          mileageAcknowledged: false,
        }),
      })
    );
  });

  it("clears name, cost and notes after a successful submit, but keeps the date and category", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogModForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("What is it?"), "Tank bag");
    await user.type(screen.getByLabelText("Cost (£)"), "50");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText("What is it?");
    expect(screen.getByLabelText("What is it?")).toHaveValue("");
    expect(screen.getByLabelText("Cost (£)")).toHaveValue(null);
    expect(screen.getByLabelText("Date")).toHaveValue(todayIso);
    expect(screen.getByLabelText("Category")).toHaveValue("exhaust-headers");
  });

  it("shows the server's own error message when the submit fails, and does not reset the form", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Something went wrong logging this part." }) });
    const user = userEvent.setup();
    render(<LogModForm initialMileage={8000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText("What is it?"), "Tank bag");
    await user.type(screen.getByLabelText("Cost (£)"), "50");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong logging this part.");
    expect(screen.getByLabelText("What is it?")).toHaveValue("Tank bag");
  });
});
