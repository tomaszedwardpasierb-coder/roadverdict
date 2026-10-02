// Place at: tests/components/ReminderEditForm.test.tsx
//
// Editing a reminder from its card: Edit opens the form pre-filled, and
// Save sends the new name and schedule as a PUT.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReminderDoc } from "@/lib/tracker/reminder";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ReminderItem } from "@/app/dashboard/ReminderItem";

const reminder: ReminderDoc = {
  id: "rem-1",
  pk: "user@example.com",
  type: "reminder",
  date: "2026-01-01",
  createdAt: "2026-01-01",
  name: "Chain lube",
  intervalType: "mileage",
  intervalValue: 500,
  baseMileage: 1000,
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ reminder }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("Editing a reminder", () => {
  it("opens pre-filled and saves the new schedule", async () => {
    const user = userEvent.setup();
    render(<ReminderItem reminder={reminder} status="ok" isPro />);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const name = screen.getByLabelText("What for");
    expect(name).toHaveValue("Chain lube");
    expect(screen.getByLabelText("Miles")).toHaveValue("500");

    await user.clear(name);
    await user.type(name, "Chain clean & lube");
    await user.selectOptions(screen.getByLabelText("Remind me"), "months");
    await user.type(screen.getByLabelText("Months"), "3");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tracker/reminders/rem-1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ name: "Chain clean & lube", intervalType: "months", intervalValue: 3 });
  });

  it("shows the server's reason when it can't save", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Pick a date." }) });
    const user = userEvent.setup();
    render(<ReminderItem reminder={reminder} status="ok" isPro />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a date.");
  });
});
