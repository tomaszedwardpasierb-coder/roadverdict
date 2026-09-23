// Place at: tests/components/CarServiceHistoryCard.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarServiceHistoryCard } from "@/app/dashboard/CarServiceHistoryCard";
import { getAdjustedCarBenchmark } from "@/lib/carPriceData";
import { formatCurrency } from "@/lib/tracker/currency";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const record = {
  id: "car-1::carService::1", pk: "x", type: "carService" as const, carId: "car-1",
  jobType: "cambelt", cost: 350, mileage: 42000, notes: "Cambelt and water pump",
  date: "2025-06-01", createdAt: "2025-06-01T00:00:00.000Z",
} as any;

const defaultProps = {
  distanceUnit: "mi" as const,
  currency: "GBP" as const,
  rates: null,
  carClass: "medium" as const,
  brandValue: "ford",
  region: "rest-england-wales" as const,
};

describe("CarServiceHistoryCard", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("shows the real label, cost, date, mileage, and notes", () => {
    render(<CarServiceHistoryCard record={record} {...defaultProps} />);
    expect(screen.getByText("Cambelt / timing belt replacement")).toBeInTheDocument();
    expect(screen.getByText("£350.00")).toBeInTheDocument();
    expect(screen.getByText(/1 Jun 2025/)).toBeInTheDocument();
    expect(screen.getByText(/42,000 miles/)).toBeInTheDocument();
    expect(screen.getByText("Cambelt and water pump")).toBeInTheDocument();
  });

  it("shows the AI-scanned banner only when needsReview is true", () => {
    const { rerender } = render(<CarServiceHistoryCard record={{ ...record, needsReview: true }} {...defaultProps} />);
    expect(screen.getByText(/Scanned from a receipt/)).toBeInTheDocument();
    rerender(<CarServiceHistoryCard record={record} {...defaultProps} />);
    expect(screen.queryByText(/Scanned from a receipt/)).not.toBeInTheDocument();
  });

  it("Edit opens a pre-filled form, and Save PATCHes the real endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarServiceHistoryCard record={record} {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Job")).toHaveValue("cambelt");
    expect(screen.getByLabelText("Cost paid")).toHaveValue(350);

    await user.clear(screen.getByLabelText("Cost paid"));
    await user.type(screen.getByLabelText("Cost paid"), "400");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-services/car-1::carService::1",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"cost":400') })
    );
  });

  it("shows the car spinner on Save while the request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<CarServiceHistoryCard record={record} {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    resolveFetch({ ok: true, json: async () => ({}) });
    await screen.findByRole("button", { name: "Edit" });
  });

  it("Delete asks for confirmation first and does nothing if declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<CarServiceHistoryCard record={record} {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Delete sends a real DELETE once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarServiceHistoryCard record={record} {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-services/car-1::carService::1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("shows a 'not shown in buyer report' note for a valet entry when includeCleaningInReport is false", () => {
    render(<CarServiceHistoryCard record={{ ...record, jobType: "valet" }} {...defaultProps} includeCleaningInReport={false} />);
    expect(screen.getByText("Not shown in buyer report")).toBeInTheDocument();
  });

  it("hides the note once includeCleaningInReport is true", () => {
    render(<CarServiceHistoryCard record={{ ...record, jobType: "wash" }} {...defaultProps} includeCleaningInReport />);
    expect(screen.queryByText("Not shown in buyer report")).not.toBeInTheDocument();
  });

  it("never shows the note for an ordinary mechanical job type, regardless of the setting", () => {
    render(<CarServiceHistoryCard record={record} {...defaultProps} includeCleaningInReport={false} />);
    expect(screen.queryByText("Not shown in buyer report")).not.toBeInTheDocument();
  });

  it("shows a real benchmark-derived 'Fair' verdict tag for an in-range cost", () => {
    const bench = getAdjustedCarBenchmark("full-service", "medium", "ford", "rest-england-wales");
    render(<CarServiceHistoryCard record={{ ...record, jobType: "full-service", cost: bench.low }} {...defaultProps} />);
    expect(
      screen.getByText(`Fair (typical ${formatCurrency(bench.low, "GBP", null)}-${formatCurrency(bench.high, "GBP", null)})`)
    ).toBeInTheDocument();
  });

  it("classifies an over-benchmark cost as 'High'", () => {
    const bench = getAdjustedCarBenchmark("tyres-front-pair", "medium", "ford", "rest-england-wales");
    render(<CarServiceHistoryCard record={{ ...record, jobType: "tyres-front-pair", cost: bench.high + 10 }} {...defaultProps} />);
    expect(
      screen.getByText(`High (typical ${formatCurrency(bench.low, "GBP", null)}-${formatCurrency(bench.high, "GBP", null)})`)
    ).toBeInTheDocument();
  });

  it("classifies a cost well past the high-multiple threshold as 'Second opinion'", () => {
    const bench = getAdjustedCarBenchmark("brake-pads-front", "medium", "ford", "rest-england-wales");
    render(<CarServiceHistoryCard record={{ ...record, jobType: "brake-pads-front", cost: Math.ceil(bench.high * 1.5) }} {...defaultProps} />);
    expect(
      screen.getByText(`Second opinion (typical ${formatCurrency(bench.low, "GBP", null)}-${formatCurrency(bench.high, "GBP", null)})`)
    ).toBeInTheDocument();
  });

  it("shows no verdict tag at all for a job type that isn't benchmarked", () => {
    render(<CarServiceHistoryCard record={record} {...defaultProps} />);
    expect(screen.queryByText(/typical £/)).not.toBeInTheDocument();
  });

  it("shows no verdict tag when the car's class or region aren't known, even for a benchmarked job type", () => {
    render(<CarServiceHistoryCard record={{ ...record, jobType: "full-service" }} {...defaultProps} carClass={undefined} />);
    expect(screen.queryByText(/typical £/)).not.toBeInTheDocument();
  });

  it("shows an attachment thumbnail when the record has one", () => {
    const attachment = { blobName: "abc123", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-01T00:00:00.000Z" };
    render(<CarServiceHistoryCard record={{ ...record, attachments: [attachment] }} {...defaultProps} />);
    expect(screen.getByRole("link", { name: "receipt.jpg" })).toHaveAttribute("href", "/api/tracker/attachment/abc123");
  });

  it("Edit shows the existing attachment as a chip, and Save includes it in the PATCH body", async () => {
    const attachment = { blobName: "abc123", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-01T00:00:00.000Z" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarServiceHistoryCard record={{ ...record, attachments: [attachment] }} {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("receipt.jpg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-services/car-1::carService::1",
      expect.objectContaining({ body: expect.stringContaining('"attachments":[{"blobName":"abc123"') })
    );
  });

  it("Removing the attachment during Edit and saving clears it (sends an empty array, not nothing)", async () => {
    const attachment = { blobName: "abc123", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-01T00:00:00.000Z" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarServiceHistoryCard record={{ ...record, attachments: [attachment] }} {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-services/car-1::carService::1",
      expect.objectContaining({ body: expect.stringContaining('"attachments":[]') })
    );
  });
});
