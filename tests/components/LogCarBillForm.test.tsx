// Place at: tests/components/LogCarBillForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("renders insurance as the default type, with a personal-cost note, and no instalment-plan option at all", () => {
    render(<LogCarBillForm currency="GBP" rates={null} />);
    expect(screen.getByLabelText("Type")).toHaveValue("insurance");
    expect(screen.getByText(/excluded.*from a shareable buyer report/)).toBeInTheDocument();
    expect(screen.queryByText(/instalment/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Payment method/i)).not.toBeInTheDocument();
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
});
