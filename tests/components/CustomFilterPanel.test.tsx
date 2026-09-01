// Place at: tests/components/CustomFilterPanel.test.tsx
//
// CustomFilterPanel ("Look something up") is a standalone client-side
// lookup over already-loaded records - it does NOT consume
// ChartFilterContext (checked: no import of it anywhere in the
// component), so no provider wrapping is needed here. No fetch either;
// everything is real filtering/aggregation logic over the props.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomFilterPanel } from "@/app/dashboard/CustomFilterPanel";

const records = [
  { jobType: "basic-service", date: "2026-01-01", cost: 50 },
  { jobType: "full-service", date: "2026-02-01", cost: 80 },
];
const mods = [
  { category: "tank-bag", name: "Kappa tank bag", date: "2026-01-10", cost: 40 },
  { category: "disc-lock", name: "Oxford lock", date: "2026-02-10", cost: 25 },
];
const bills = [
  { billType: "insurance", date: "2026-01-05", cost: 200 },
  { billType: "road-tax", date: "2026-06-05", cost: 60 },
];

function baseProps() {
  return {
    records,
    mods,
    bills,
    fuelLogs: [],
    currency: "GBP" as const,
    rates: null,
    fuelEconomyUnit: "mpg" as const,
  };
}

describe("CustomFilterPanel", () => {
  it("defaults to Service, totalling every real record with the right entry count", () => {
    render(<CustomFilterPanel {...baseProps()} />);
    expect(screen.getByLabelText("Category")).toHaveValue("service");
    expect(screen.getByText("£130", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("2 entries")).toBeInTheDocument();
    expect(screen.getByText("Basic service", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Full service", { selector: "span" })).toBeInTheDocument();
  });

  it("filtering Service by a specific item narrows the total and uses singular 'entry'", async () => {
    const user = userEvent.setup();
    render(<CustomFilterPanel {...baseProps()} />);
    await user.selectOptions(screen.getByLabelText("Item"), "full-service");

    expect(screen.getByText("£80", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("1 entry")).toBeInTheDocument();
    expect(screen.queryByText("Basic service", { selector: "span" })).not.toBeInTheDocument();
  });

  it("switching to Mods shows every real mod's real category label and name, and their total", async () => {
    const user = userEvent.setup();
    render(<CustomFilterPanel {...baseProps()} />);
    await user.selectOptions(screen.getByLabelText("Category"), "mods");

    expect(screen.getByText("£65", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("Tank bag: Kappa tank bag")).toBeInTheDocument();
    expect(screen.getByText("Disc lock: Oxford lock")).toBeInTheDocument();
  });

  it("picking a mod Group filters entries to just that group's real subcategory keys", async () => {
    const user = userEvent.setup();
    render(<CustomFilterPanel {...baseProps()} />);
    await user.selectOptions(screen.getByLabelText("Category"), "mods");
    await user.selectOptions(screen.getByLabelText("Group"), "Electronics & security");

    expect(screen.getByText("£25", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("Disc lock: Oxford lock")).toBeInTheDocument();
    expect(screen.queryByText("Tank bag: Kappa tank bag")).not.toBeInTheDocument();
  });

  it("selecting a suggested mod from the real search autocomplete narrows to that exact item and its group", async () => {
    const user = userEvent.setup();
    render(<CustomFilterPanel {...baseProps()} />);
    await user.selectOptions(screen.getByLabelText("Category"), "mods");
    await user.type(screen.getByLabelText("Search for an item"), "tank bag");
    await user.click(await screen.findByRole("button", { name: "Tank bag" }));

    expect(screen.getByLabelText("Group")).toHaveValue("Comfort & practicality");
    expect(screen.getByLabelText("Item")).toHaveValue("tank-bag");
    expect(screen.getByText("£40", { selector: "div" })).toBeInTheDocument();
    expect(screen.queryByText("Disc lock: Oxford lock")).not.toBeInTheDocument();
  });

  it("switching to Bills filters by real bill type and label", async () => {
    const user = userEvent.setup();
    render(<CustomFilterPanel {...baseProps()} />);
    await user.selectOptions(screen.getByLabelText("Category"), "bills");
    await user.selectOptions(screen.getByLabelText("Item"), "insurance");

    expect(screen.getByText("£200", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("Insurance", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("Road tax (VED)", { selector: "span" })).not.toBeInTheDocument();
  });

  it("switching category resets the previous category's own filters back to their defaults", async () => {
    const user = userEvent.setup();
    render(<CustomFilterPanel {...baseProps()} />);
    await user.selectOptions(screen.getByLabelText("Category"), "mods");
    await user.selectOptions(screen.getByLabelText("Group"), "Electronics & security");
    await user.selectOptions(screen.getByLabelText("Category"), "bills");
    await user.selectOptions(screen.getByLabelText("Category"), "mods");

    expect(screen.getByLabelText("Group")).toHaveValue("__all__");
    expect(screen.getByText("£65", { selector: "div" })).toBeInTheDocument();
  });

  it("real entries render sorted newest first regardless of input order", () => {
    render(<CustomFilterPanel {...baseProps()} />);
    const dates = screen.getAllByText(/\d{1,2} \w{3} 2026/).map((el) => el.textContent);
    expect(dates).toEqual(["1 Feb 2026", "1 Jan 2026"]);
  });

  it("Between exact dates excludes anything outside the real From/To bounds", async () => {
    const user = userEvent.setup();
    render(<CustomFilterPanel {...baseProps()} />);
    await user.type(screen.getByLabelText("From"), "2026-02-01");
    await user.type(screen.getByLabelText("To"), "2026-02-28");

    expect(screen.getByText("£80", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("1 entry")).toBeInTheDocument();
    expect(screen.queryByText("Basic service", { selector: "span" })).not.toBeInTheDocument();
  });

  it("Last N days computes a real cutoff from the current clock, not a fixed date", async () => {
    const recent = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    const old = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10);
    const user = userEvent.setup();
    render(
      <CustomFilterPanel
        {...baseProps()}
        records={[
          { jobType: "basic-service", date: recent, cost: 50 },
          { jobType: "full-service", date: old, cost: 80 },
        ]}
      />
    );
    await user.selectOptions(screen.getByLabelText("Date range"), "lastN");

    expect(screen.getByLabelText("Last how many days?")).toHaveValue(30); // real default, not reset by switching mode
    expect(screen.getByText("£50", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("1 entry")).toBeInTheDocument();
  });

  it("Fuel shows a real average MPG computed from actual full-tank segments in range", async () => {
    const user = userEvent.setup();
    render(
      <CustomFilterPanel
        {...baseProps()}
        fuelLogs={[
          { id: "f1", date: "2026-01-01", cost: 20, mileage: 10000, litres: 10, filledToFull: true },
          { id: "f2", date: "2026-02-01", cost: 22, mileage: 10300, litres: 11, filledToFull: true },
        ]}
      />
    );
    await user.selectOptions(screen.getByLabelText("Category"), "fuel");

    expect(screen.getByText("£42", { selector: "div" })).toBeInTheDocument(); // both fill-ups' real cost, 20 + 22
    expect(screen.getByText("2 entries")).toBeInTheDocument();
    expect(screen.getAllByText("Fuel fill-up")).toHaveLength(2);
    expect(screen.getByText("124.0 mpg average for this range")).toBeInTheDocument();
  });

  it("real total respects the chosen display currency, not the stored GBP amount", async () => {
    const user = userEvent.setup();
    render(
      <CustomFilterPanel
        {...baseProps()}
        currency="EUR"
        rates={{ base: "GBP", rates: { EUR: 1.15 }, fetchedAt: "2026-01-01T00:00:00.000Z" }}
      />
    );
    // 130 GBP * 1.15 = 149.5 -> rounds to 150 in formatCurrency's toFixed(0)
    expect(screen.getByText("€150")).toBeInTheDocument();
  });
});
