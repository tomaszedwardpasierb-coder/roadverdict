// Place at: tests/components/LogCarBillForm.test.tsx
// Mirrors LogBillForm.test.tsx's instalment-plan coverage, now that
// LogCarBillForm.tsx has a full plan-creation path too.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogCarBillForm } from "@/app/dashboard/LogCarBillForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const todayIso = new Date().toISOString().slice(0, 10);

describe("LogCarBillForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders insurance as the default type, with a personal-cost note", () => {
    render(<LogCarBillForm currency="GBP" rates={null} />);
    expect(screen.getByLabelText("Type")).toHaveValue("insurance");
    expect(screen.getByText(/excluded.*from a shareable buyer report/)).toBeInTheDocument();
  });

  // Car-only bill type, no motorcycle equivalent - proves CAR_BILL_LABELS
  // is really what's populating this select.
  it("includes car-only bill types such as congestion charge", () => {
    render(<LogCarBillForm currency="GBP" rates={null} />);
    expect(screen.getByRole("option", { name: "Congestion Charge" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ULEZ / Clean Air Zone charge" })).toBeInTheDocument();
  });

  it("blocks submit and shows a specific error for a date before the car's own production year", async () => {
    const user = userEvent.setup();
    render(<LogCarBillForm currency="GBP" rates={null} carYear={2020} />);
    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2019-06-01");
    expect(await screen.findByRole("alert")).toHaveTextContent(/before 2020, when this car was made/);
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("submits the real form state, including the default 12-month reminder, to /api/cars/car-bills", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogCarBillForm currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText(/Cost paid/), "420");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByLabelText(/Cost paid/);
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-bills",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          billType: "insurance",
          cost: 420,
          date: todayIso,
          notes: "",
          reminder: { intervalType: "months", intervalValue: 12, additionalTriggers: [] },
        }),
      })
    );
  });

  it("shows the server's own error message when the submit fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Something went wrong." }) });
    const user = userEvent.setup();
    render(<LogCarBillForm currency="GBP" rates={null} />);

    await user.type(screen.getByLabelText(/Cost paid/), "420");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
  });

  // ── Instalment plans - mirrors LogBillForm.test.tsx's own coverage ──────

  it("offers an instalment-plan payment method for insurance/road-tax/finance, submitting to /api/cars/car-bill-series", () => {
    render(<LogCarBillForm currency="GBP" rates={null} />);
    expect(screen.getByLabelText("How do you pay?")).toBeInTheDocument();
  });

  it("hides the payment-method question for MOT, which is always a one-off", async () => {
    const user = userEvent.setup();
    render(<LogCarBillForm currency="GBP" rates={null} />);
    await user.selectOptions(screen.getByLabelText("Type"), "mot-test");
    expect(screen.queryByLabelText("How do you pay?")).not.toBeInTheDocument();
  });

  it("allows a finance plan with a deposit, same as insurance", async () => {
    const user = userEvent.setup();
    render(<LogCarBillForm currency="GBP" rates={null} />);
    await user.selectOptions(screen.getByLabelText("Type"), "finance");
    await user.selectOptions(screen.getByLabelText("How do you pay?"), "plan");
    expect(screen.getByLabelText(/^Deposit/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Regular instalment amount/)).toBeInTheDocument();
  });

  it("never shows 'instalments already paid' for a plan starting today", async () => {
    const user = userEvent.setup();
    render(<LogCarBillForm currency="GBP" rates={null} />);
    await user.selectOptions(screen.getByLabelText("How do you pay?"), "plan");
    expect(screen.queryByLabelText(/Instalments already paid/)).not.toBeInTheDocument();
  });

  it("shows 'instalments already paid' once a plan's start date is backdated", async () => {
    const user = userEvent.setup();
    render(<LogCarBillForm currency="GBP" rates={null} />);
    const past = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10);

    await user.selectOptions(screen.getByLabelText("How do you pay?"), "plan");
    const dateInput = screen.getByLabelText("Start date (first payment)");
    await user.clear(dateInput);
    await user.type(dateInput, past);

    expect(screen.getByLabelText(/Instalments already paid/)).toBeInTheDocument();
  });

  it("includes instalmentsAlreadyPaid in the plan submission body when filled in", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogCarBillForm currency="GBP" rates={null} />);

    await user.selectOptions(screen.getByLabelText("How do you pay?"), "plan");
    const dateInput = screen.getByLabelText("Start date (first payment)");
    const past = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10);
    await user.clear(dateInput);
    await user.type(dateInput, past);
    await user.type(screen.getByLabelText(/Regular instalment amount/), "42.50");
    await user.type(screen.getByLabelText(/Instalments already paid/), "3");
    await user.click(screen.getByRole("button", { name: "Start this plan" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/cars/car-bill-series", expect.anything()));
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.instalmentsAlreadyPaid).toBe(3);
  });

  it("omits instalmentsAlreadyPaid from the submission body when left blank", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogCarBillForm currency="GBP" rates={null} />);

    await user.selectOptions(screen.getByLabelText("How do you pay?"), "plan");
    await user.type(screen.getByLabelText(/Regular instalment amount/), "42.50");
    await user.click(screen.getByRole("button", { name: "Start this plan" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/cars/car-bill-series", expect.anything()));
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.instalmentsAlreadyPaid).toBeUndefined();
  });

  it("offers a frequency choice only for road-tax, defaulting insurance/finance to monthly", async () => {
    const user = userEvent.setup();
    render(<LogCarBillForm currency="GBP" rates={null} />);
    await user.selectOptions(screen.getByLabelText("How do you pay?"), "plan");
    expect(screen.queryByLabelText("Frequency")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Type"), "road-tax");
    expect(screen.getByLabelText("Frequency")).toBeInTheDocument();
  });
});
