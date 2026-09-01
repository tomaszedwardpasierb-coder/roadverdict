// Place at: tests/components/ReminderItem.test.tsx
//
// One reminder's display row. Uses the real reminderDetailLabel
// (src/lib/tracker/reminderStatus.ts) for its detail text, so a real
// ReminderDoc fixture is used rather than a canned string. window.confirm
// is stubbed since exact-date "Done" and both delete paths gate on it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReminderDoc } from "@/lib/tracker/reminder";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ReminderItem } from "@/app/dashboard/ReminderItem";

function makeReminder(overrides: Partial<ReminderDoc> = {}): ReminderDoc {
  return {
    id: "rem-1",
    pk: "user@example.com",
    type: "reminder",
    date: "2026-01-01",
    createdAt: "2026-01-01",
    name: "Chain lube",
    intervalType: "mileage",
    intervalValue: 500,
    baseMileage: 1000,
    ...overrides,
  };
}

describe("ReminderItem", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the name, real detail label, and status text/class", () => {
    render(<ReminderItem reminder={makeReminder()} status="due-soon" />);
    expect(screen.getByText("Chain lube")).toBeInTheDocument();
    expect(screen.getByText(/due around 1,500 miles \(every 500 mi\)/)).toBeInTheDocument();
    expect(screen.getByText("Due soon")).toBeInTheDocument();
  });

  it("a mileage/months reminder's Done just PATCHes - no confirmation needed since it rolls forward", async () => {
    const user = userEvent.setup();
    render(<ReminderItem reminder={makeReminder()} status="overdue" />);
    const confirmSpy = vi.spyOn(window, "confirm");

    await user.click(screen.getByRole("button", { name: "✓ Done" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/reminders/rem-1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("an exact-date reminder's Done asks for confirmation, then deletes and hides the row", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<ReminderItem reminder={makeReminder({ intervalType: "date", exactDate: "2026-06-01", intervalValue: undefined })} status="ok" />);

    await user.click(screen.getByRole("button", { name: "✓ Done" }));

    expect(fetch).toHaveBeenCalledWith("/api/tracker/reminders/rem-1", expect.objectContaining({ method: "DELETE" }));
    expect(screen.queryByText("Chain lube")).not.toBeInTheDocument();
  });

  it("declining the exact-date confirmation leaves the reminder untouched", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<ReminderItem reminder={makeReminder({ intervalType: "date", exactDate: "2026-06-01", intervalValue: undefined })} status="ok" />);

    await user.click(screen.getByRole("button", { name: "✓ Done" }));

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Chain lube")).toBeInTheDocument();
  });

  it("the ✕ delete button also confirms first, then deletes and hides the row", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<ReminderItem reminder={makeReminder()} status="ok" />);

    await user.click(screen.getByRole("button", { name: "✕" }));

    expect(fetch).toHaveBeenCalledWith("/api/tracker/reminders/rem-1", expect.objectContaining({ method: "DELETE" }));
    expect(screen.queryByText("Chain lube")).not.toBeInTheDocument();
  });
});
