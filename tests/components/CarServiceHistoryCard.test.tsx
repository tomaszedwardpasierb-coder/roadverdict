// Place at: tests/components/CarServiceHistoryCard.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarServiceHistoryCard } from "@/app/dashboard/CarServiceHistoryCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const record = {
  id: "car-1::carService::1", pk: "x", type: "carService" as const, carId: "car-1",
  jobType: "cambelt", cost: 350, mileage: 42000, notes: "Cambelt and water pump",
  date: "2025-06-01", createdAt: "2025-06-01T00:00:00.000Z",
} as any;

describe("CarServiceHistoryCard", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("shows the real label, cost, date, mileage, and notes", () => {
    render(<CarServiceHistoryCard record={record} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.getByText("Cambelt / timing belt replacement")).toBeInTheDocument();
    expect(screen.getByText("£350.00")).toBeInTheDocument();
    expect(screen.getByText(/1 Jun 2025/)).toBeInTheDocument();
    expect(screen.getByText(/42,000 miles/)).toBeInTheDocument();
    expect(screen.getByText("Cambelt and water pump")).toBeInTheDocument();
  });

  it("shows the AI-scanned banner only when needsReview is true", () => {
    const { rerender } = render(<CarServiceHistoryCard record={{ ...record, needsReview: true }} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.getByText(/Scanned from a receipt/)).toBeInTheDocument();
    rerender(<CarServiceHistoryCard record={record} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.queryByText(/Scanned from a receipt/)).not.toBeInTheDocument();
  });

  it("Edit opens a pre-filled form, and Save PATCHes the real endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarServiceHistoryCard record={record} distanceUnit="mi" currency="GBP" rates={null} />);

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

  it("Delete asks for confirmation first and does nothing if declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<CarServiceHistoryCard record={record} distanceUnit="mi" currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Delete sends a real DELETE once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarServiceHistoryCard record={record} distanceUnit="mi" currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-services/car-1::carService::1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
