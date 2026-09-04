// Place at: tests/components/LogBillForm.test.tsx
//
// "Log insurance, tax, or an MOT" - a bill with an optional reminder
// (ReminderFields, exercised for real here too) and the two date-sanity
// checks every logging form shares: production-year guard (hard block)
// and backdate notice (informational only). Only `fetch` and
// next/navigation's useRouter (pulled in transitively via
// useTrackerFormSubmit) are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { LogBillForm } from "@/app/dashboard/LogBillForm";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("LogBillForm", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the bill-type options and a reminder defaulted to 12 months, checked", () => {
    render(<LogBillForm currency="GBP" rates={null} />);
    expect(screen.getByLabelText("Type")).toHaveValue("insurance");
    expect(screen.getByText("Insurance")).toBeInTheDocument();
    expect(screen.getByText("Road tax (VED)")).toBeInTheDocument();
    expect(screen.getByText("MOT test")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Remind me when this is due/ })).toBeChecked();
    expect(document.getElementById("remind-bill-value-0")).toHaveValue(12);
  });

  it("shows the insurance-not-in-report note by default (insurance is the default type)", () => {
    render(<LogBillForm currency="GBP" rates={null} />);
    expect(screen.getByText(/won't appear in your shareable report by default/)).toBeInTheDocument();
  });

  it("hides the insurance note once a non-insurance type is selected", async () => {
    const user = userEvent.setup();
    render(<LogBillForm currency="GBP" rates={null} />);
    await user.selectOptions(screen.getByLabelText("Type"), "road-tax");
    expect(screen.queryByText(/won't appear in your shareable report by default/)).not.toBeInTheDocument();
  });

  it("shows a finance-specific not-in-report note once finance is selected", async () => {
    const user = userEvent.setup();
    render(<LogBillForm currency="GBP" rates={null} />);
    await user.selectOptions(screen.getByLabelText("Type"), "finance");
    expect(screen.getByText(/Finance costs are personal to you/)).toBeInTheDocument();
    expect(screen.queryByText(/Insurance costs are personal to you/)).not.toBeInTheDocument();
  });

  it("allows a finance plan with a deposit, same as insurance", async () => {
    const user = userEvent.setup();
    render(<LogBillForm currency="GBP" rates={null} />);
    await user.selectOptions(screen.getByLabelText("Type"), "finance");
    await user.selectOptions(screen.getByLabelText("How do you pay?"), "plan");
    expect(screen.getByLabelText(/^Deposit/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Regular instalment amount/)).toBeInTheDocument();
  });

  it("blocks submission with an error when the date is before the bike's own production year", async () => {
    const user = userEvent.setup();
    render(<LogBillForm currency="GBP" rates={null} bikeYear={2020} isCustomBuild={false} />);
    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2015-06-01");

    expect(await screen.findByRole("alert")).toHaveTextContent(/before 2020/);
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a backdate notice, without blocking submission, for a claimed date well over a week in the past", async () => {
    const user = userEvent.setup();
    render(<LogBillForm currency="GBP" rates={null} />);
    const dateInput = screen.getByLabelText("Date");
    const past = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
    await user.clear(dateInput);
    await user.type(dateInput, past);

    expect(screen.getByText(/Logged .* after the claimed date/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).not.toBeDisabled();
  });

  it("submits the real form state, including the single default reminder trigger, then clears cost and notes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogBillForm currency="GBP" rates={null} />);
    await user.type(screen.getByLabelText(/Cost/), "120");
    await user.type(screen.getByLabelText("Notes (optional)"), "Bennetts renewal");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bills",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          billType: "insurance",
          cost: 120,
          date: todayStr(),
          notes: "Bennetts renewal",
          reminder: { intervalType: "months", intervalValue: 12 },
        }),
      })
    );
    await waitFor(() => expect(screen.getByLabelText(/Cost/)).toHaveValue(null));
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("");
  });

  it("omits the reminder field entirely once 'remind me' is unticked", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogBillForm currency="GBP" rates={null} />);
    await user.click(screen.getByRole("checkbox", { name: /Remind me when this is due/ }));
    await user.type(screen.getByLabelText(/Cost/), "50");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bills",
      expect.objectContaining({
        body: JSON.stringify({ billType: "insurance", cost: 50, date: todayStr(), notes: "" }),
      })
    );
  });

  it("switching bill type resets a customised reminder interval back to that new type's own default", async () => {
    const user = userEvent.setup();
    render(<LogBillForm currency="GBP" rates={null} />);
    const valueInput = document.getElementById("remind-bill-value-0") as HTMLInputElement;
    await user.clear(valueInput);
    await user.type(valueInput, "6");
    expect(document.getElementById("remind-bill-value-0")).toHaveValue(6);

    await user.selectOptions(screen.getByLabelText("Type"), "road-tax");
    expect(document.getElementById("remind-bill-value-0")).toHaveValue(12);
  });

  it("a second reminder trigger, once added and filled in, is sent as an additionalTrigger", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogBillForm currency="GBP" rates={null} />);
    await user.click(screen.getByText("+ Also remind me by..."));
    const secondValue = document.getElementById("remind-bill-value-1") as HTMLInputElement;
    await user.type(secondValue, "5000");
    await user.type(screen.getByLabelText(/Cost/), "90");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bills",
      expect.objectContaining({
        body: JSON.stringify({
          billType: "insurance",
          cost: 90,
          date: todayStr(),
          notes: "",
          reminder: { intervalType: "months", intervalValue: 12, additionalTriggers: [{ intervalType: "mileage", intervalValue: 5000 }] },
        }),
      })
    );
  });
});
