// Place at: tests/components/NotificationBell.test.tsx
//
// NotificationBell fetches its own notifications on mount, renders an
// unread-count badge, and manages its dropdown's open/close and
// mark-as-read behaviour entirely client-side (optimistic updates before
// the network call settles). Only `fetch` is mocked; `window.location`
// is stubbed to a plain writable object so a notification's real
// navigation-on-click can be observed without jsdom's "not implemented"
// navigation noise.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NotificationDoc } from "@/lib/tracker/notification";

import { NotificationBell } from "@/app/dashboard/NotificationBell";

function makeNotification(overrides: Partial<NotificationDoc> = {}): NotificationDoc {
  return {
    id: "n1",
    pk: "user@example.com",
    type: "notification",
    kind: "broadcast",
    title: "New feature",
    body: "You can now export to CSV.",
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("NotificationBell", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, href: "" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a plain 'Notifications' label with no badge until unread notifications actually load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notifications: [], unreadCount: 0 }) })
    );
    render(<NotificationBell />);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/tracker/notifications"));
  });

  it("shows the real unread count in both the badge text and the button's accessible name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ notifications: [makeNotification()], unreadCount: 3 }),
      })
    );
    render(<NotificationBell />);
    expect(await screen.findByRole("button", { name: "Notifications, 3 unread" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("caps the badge at 999+ rather than showing an arbitrarily large number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notifications: [], unreadCount: 1500 }) })
    );
    render(<NotificationBell />);
    expect(await screen.findByText("999+")).toBeInTheDocument();
  });

  it("a failed fetch leaves the bell showing zero unread rather than breaking the dashboard around it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<NotificationBell />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("opening the dropdown shows 'Nothing here yet.' when there are no notifications", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notifications: [], unreadCount: 0 }) })
    );
    const user = userEvent.setup();
    render(<NotificationBell />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("opening the dropdown lists real notifications with their title, body and date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          notifications: [makeNotification({ title: "Heads up", body: "Something happened.", createdAt: "2024-03-15T00:00:00.000Z" })],
          unreadCount: 1,
        }),
      })
    );
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));

    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Something happened.")).toBeInTheDocument();
    expect(screen.getByText("15 Mar 2024")).toBeInTheDocument();
  });

  it("Mark all read clears the badge immediately and tells the server, without needing a per-id body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [makeNotification(), makeNotification({ id: "n2" })], unreadCount: 2 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await user.click(screen.getByRole("button", { name: "Mark all read" }));

    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark all read" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/tracker/notifications/mark-read", { method: "POST" })
    );
  });

  it("clicking one unread notification marks only that one as read and posts its id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        notifications: [makeNotification({ id: "n1" }), makeNotification({ id: "n2", title: "Second" })],
        unreadCount: 2,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await user.click(screen.getByText("New feature"));

    expect(await screen.findByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tracker/notifications/mark-read",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "n1" }) })
      )
    );
  });

  it("clicking a notification with a linkTo navigates the page there", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ notifications: [makeNotification({ linkTo: "/dashboard/fuel" })], unreadCount: 1 }),
      })
    );
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await user.click(screen.getByText("New feature"));

    await waitFor(() => expect(window.location.href).toBe("/dashboard/fuel"));
  });

  it("clicking outside the bell closes an open dropdown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notifications: [], unreadCount: 0 }) })
    );
    const user = userEvent.setup();
    render(<NotificationBell />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Nothing here yet.")).not.toBeInTheDocument();
  });

  it("anchors the dropdown to the right edge when opening it near the right side of the viewport would overflow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notifications: [], unreadCount: 0 }) })
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 900,
      right: 930,
      top: 0,
      bottom: 30,
      width: 30,
      height: 30,
      x: 900,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

    const user = userEvent.setup();
    render(<NotificationBell />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Notifications" }));

    const dropdown = screen.getByText("Nothing here yet.").parentElement as HTMLElement;
    expect(dropdown.style.right).toBe("0px");
    expect(dropdown.style.left).toBe("");
  });
});
