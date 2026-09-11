// Place at: tests/components/CarBillCard.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarBillCard } from "@/app/dashboard/CarBillCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const bill = {
  id: "car-1::carBill::1", pk: "x", type: "carBill" as const, carId: "car-1",
  billType: "insurance", cost: 420, notes: "Annual renewal", date: "2025-06-01", createdAt: "2025-06-01T00:00:00.000Z",
} as any;

describe("CarBillCard", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("shows the real bill type label, cost, and notes", () => {
    render(<CarBillCard bill={bill} currency="GBP" rates={null} />);
    expect(screen.getByText("Insurance")).toBeInTheDocument();
    expect(screen.getByText("£420.00")).toBeInTheDocument();
    expect(screen.getByText("Annual renewal")).toBeInTheDocument();
  });

  it("shows a car-only bill type (congestion charge) correctly labelled", () => {
    render(<CarBillCard bill={{ ...bill, billType: "congestion" }} currency="GBP" rates={null} />);
    expect(screen.getByText("Congestion Charge")).toBeInTheDocument();
  });

  it("shows a DVSA-recorded MOT mileage as read-only when present", () => {
    render(<CarBillCard bill={{ ...bill, billType: "mot-test", mileage: 41000 }} currency="GBP" rates={null} />);
    expect(screen.getByText(/41,000 mi \(MOT-recorded, not editable here\)/)).toBeInTheDocument();
  });

  it("Edit opens a pre-filled form, and Save PATCHes the real endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarBillCard bill={bill} currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Type")).toHaveValue("insurance");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-bills/car-1::carBill::1", expect.objectContaining({ method: "PATCH" }));
  });

  it("shows the car spinner on Save while the request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<CarBillCard bill={bill} currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    resolveFetch({ ok: true, json: async () => ({}) });
    await screen.findByRole("button", { name: "Edit" });
  });

  it("Delete sends a real DELETE once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarBillCard bill={bill} currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-bills/car-1::carBill::1", expect.objectContaining({ method: "DELETE" }));
  });

  it("shows a 'not shown in buyer report' tag for insurance when includeInsuranceInReport is false", () => {
    render(<CarBillCard bill={bill} currency="GBP" rates={null} includeInsuranceInReport={false} />);
    expect(screen.getByText("Not shown in buyer report")).toBeInTheDocument();
  });

  it("hides the tag once includeInsuranceInReport is true", () => {
    render(<CarBillCard bill={bill} currency="GBP" rates={null} includeInsuranceInReport />);
    expect(screen.queryByText("Not shown in buyer report")).not.toBeInTheDocument();
  });

  it("shows the tag for finance when includeFinanceInReport is false, independently of the insurance setting", () => {
    render(<CarBillCard bill={{ ...bill, billType: "finance" }} currency="GBP" rates={null} includeInsuranceInReport includeFinanceInReport={false} />);
    expect(screen.getByText("Not shown in buyer report")).toBeInTheDocument();
  });

  it("hides the finance tag once includeFinanceInReport is true", () => {
    render(<CarBillCard bill={{ ...bill, billType: "finance" }} currency="GBP" rates={null} includeFinanceInReport />);
    expect(screen.queryByText("Not shown in buyer report")).not.toBeInTheDocument();
  });
});
