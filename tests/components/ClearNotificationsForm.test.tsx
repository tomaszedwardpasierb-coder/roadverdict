// Place at: tests/components/ClearNotificationsForm.test.tsx
//
// Two independent filter dimensions (which notifications, which
// recipients) mirroring SendNotificationForm's all/specific pattern -
// only fetch and window.confirm are mocked; every state transition
// runs for real.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BroadcastSummary } from "@/lib/tracker/notification";
import { ClearNotificationsForm } from "@/app/tomasz/ClearNotificationsForm";

const broadcasts: BroadcastSummary[] = [
  { title: "Heads up", body: "New feature shipped.", createdAt: "2026-01-01T10:00:00.000Z", recipientCount: 3 },
  { title: "Reminder", body: "Please renew.", createdAt: "2026-02-01T10:00:00.000Z", recipientCount: 1 },
];
const allEmails = ["a@example.com", "b@example.com"];

describe("ClearNotificationsForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to 'All notifications ever sent' and 'All users'", () => {
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={allEmails} />);
    expect(screen.getByLabelText("All notifications ever sent")).toBeChecked();
    expect(screen.getByLabelText("All users")).toBeChecked();
  });

  it("switching to 'Specific notifications' lists each broadcast with its title, date, and recipient count", async () => {
    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={allEmails} />);
    await user.click(screen.getByLabelText("Specific notifications"));

    expect(screen.getByLabelText(/Heads up.*sent to 3 users/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reminder.*sent to 1 user\b/)).toBeInTheDocument();
  });

  it("switching to 'Specific users' lists each email as its own checkbox", async () => {
    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={allEmails} />);
    await user.click(screen.getByLabelText("Specific users"));

    expect(screen.getByLabelText("a@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("b@example.com")).toBeInTheDocument();
  });

  it("shows a note when there are no notifications to choose from", async () => {
    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={[]} allEmails={allEmails} />);
    await user.click(screen.getByLabelText("Specific notifications"));
    expect(screen.getByText("No notifications sent yet.")).toBeInTheDocument();
  });

  it("shows a note when there are no registered users", async () => {
    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={[]} />);
    await user.click(screen.getByLabelText("Specific users"));
    expect(screen.getByText("No registered users found.")).toBeInTheDocument();
  });

  it("blocks submission when 'Specific notifications' is chosen but none are ticked", async () => {
    vi.stubGlobal("confirm", vi.fn());
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={allEmails} />);
    await user.click(screen.getByLabelText("Specific notifications"));
    await user.click(screen.getByRole("button", { name: "Clear notifications" }));

    expect(await screen.findByText('Choose at least one notification to clear, or switch to "All notifications".')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks submission when 'Specific users' is chosen but none are ticked", async () => {
    vi.stubGlobal("confirm", vi.fn());
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={allEmails} />);
    await user.click(screen.getByLabelText("Specific users"));
    await user.click(screen.getByRole("button", { name: "Clear notifications" }));

    expect(await screen.findByText('Choose at least one user, or switch to "All users".')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("declining the confirm dialog aborts the clear entirely", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={allEmails} />);
    await user.click(screen.getByRole("button", { name: "Clear notifications" }));

    expect(confirm).toHaveBeenCalledWith("Clear ALL notifications for all 2 user(s)? This can't be undone.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("'all' broadcasts + 'all' recipients: posts both as 'all' and shows the cleared count", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ deletedCount: 5 }) }));

    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={allEmails} />);
    await user.click(screen.getByRole("button", { name: "Clear notifications" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/clear-notifications",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ broadcasts: "all", recipients: "all" }),
      })
    );
    expect(await screen.findByText("Cleared 5 notifications.")).toBeInTheDocument();
  });

  it("specific broadcasts + all users: posts only the ticked broadcast's (title, body, createdAt)", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ deletedCount: 3 }) }));

    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={allEmails} />);
    await user.click(screen.getByLabelText("Specific notifications"));
    await user.click(screen.getByLabelText(/Heads up/));
    await user.click(screen.getByRole("button", { name: "Clear notifications" }));

    expect(confirm).toHaveBeenCalledWith("Clear 1 selected notification(s) for all 2 user(s)? This can't be undone.");
    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/clear-notifications",
      expect.objectContaining({
        body: JSON.stringify({
          broadcasts: [{ title: "Heads up", body: "New feature shipped.", createdAt: "2026-01-01T10:00:00.000Z" }],
          recipients: "all",
        }),
      })
    );
  });

  it("all broadcasts + specific users: posts only the ticked emails", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ deletedCount: 1 }) }));

    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={allEmails} />);
    await user.click(screen.getByLabelText("Specific users"));
    await user.click(screen.getByLabelText("b@example.com"));
    await user.click(screen.getByRole("button", { name: "Clear notifications" }));

    expect(confirm).toHaveBeenCalledWith("Clear ALL notifications for 1 selected user(s)? This can't be undone.");
    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/clear-notifications",
      expect.objectContaining({
        body: JSON.stringify({ broadcasts: "all", recipients: ["b@example.com"] }),
      })
    );
  });

  it("shows the server's error text without clearing selections", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Could not clear notifications." }) }));

    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={allEmails} />);
    await user.click(screen.getByRole("button", { name: "Clear notifications" }));

    expect(await screen.findByText("Could not clear notifications.")).toBeInTheDocument();
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const user = userEvent.setup();
    render(<ClearNotificationsForm broadcasts={broadcasts} allEmails={allEmails} />);
    await user.click(screen.getByRole("button", { name: "Clear notifications" }));

    expect(await screen.findByText("Couldn't reach the server. Try again.")).toBeInTheDocument();
  });
});
