// Place at: tests/components/CarReminderItem.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarReminderItem } from "@/app/dashboard/CarReminderItem";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const mileageReminder = {
  id: "car-1::carReminder::1", pk: "x", type: "carReminder" as const, carId: "car-1",
  name: "Cambelt", intervalType: "mileage" as const, intervalValue: 60000, baseMileage: 0,
  date: "2025-01-01", notifiedAt: null, createdAt: "2025-01-01T00:00:00.000Z",
} as any;
const dateReminder = { ...mileageReminder, intervalType: "date" as const, intervalValue: undefined, exactDate: "2026-06-01" };

describe("CarReminderItem", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("shows the real name and status label", () => {
    render(<CarReminderItem reminder={mileageReminder} status="overdue" isPro={true} />);
    expect(screen.getByText("Cambelt")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("hides the exact due detail behind a Pro upsell when not Pro", () => {
    render(<CarReminderItem reminder={mileageReminder} status="ok" isPro={false} />);
    expect(screen.getByText(/Upgrade to Pro/)).toBeInTheDocument();
    expect(screen.queryByText(/60,000 mi/)).not.toBeInTheDocument();
  });

  it("shows the real due detail when Pro", () => {
    render(<CarReminderItem reminder={mileageReminder} status="ok" isPro={true} />);
    expect(screen.getByText(/60,000 mi/)).toBeInTheDocument();
  });

  it("Mark done PATCHes a mileage-type reminder", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarReminderItem reminder={mileageReminder} status="overdue" isPro={true} />);
    await user.click(screen.getByRole("button", { name: "Mark done" }));
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-reminders/car-1::carReminder::1", expect.objectContaining({ method: "PATCH" }));
  });

  // A pure date-type reminder has no interval to roll forward, so "done"
  // deletes it instead of PATCHing a reset that wouldn't move exactDate.
  it("Mark done DELETEs a pure date-type reminder instead of PATCHing it", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarReminderItem reminder={dateReminder} status="overdue" isPro={true} />);
    await user.click(screen.getByRole("button", { name: "Mark done" }));
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-reminders/car-1::carReminder::1", expect.objectContaining({ method: "DELETE" }));
  });

  it("Delete asks for confirmation and sends a real DELETE once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarReminderItem reminder={mileageReminder} status="ok" isPro={true} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-reminders/car-1::carReminder::1", expect.objectContaining({ method: "DELETE" }));
  });

  // A permanent (SORN) reminder can only ever be cleared by the system -
  // see ReminderItem.test.tsx's own equivalent test for why.
  it("hides both Mark done and Delete for a permanent reminder, and shows the explanatory detail regardless of Pro status", () => {
    const permanentReminder = { ...mileageReminder, intervalType: "permanent" as const, intervalValue: undefined, baseMileage: undefined };
    render(<CarReminderItem reminder={permanentReminder} status="overdue" isPro={false} />);

    expect(screen.queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByText("Clears automatically once the vehicle is confirmed taxed again")).toBeInTheDocument();
    expect(screen.queryByText(/Upgrade to Pro/)).not.toBeInTheDocument();
  });
});
