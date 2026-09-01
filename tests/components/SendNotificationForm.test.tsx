// Place at: tests/components/SendNotificationForm.test.tsx
//
// A broadcast-notification composer with real reach - the confirm()
// naming exactly who it's going to is the only guard before an
// irreversible send. Only `fetch` and window.confirm are mocked;
// everything else (recipient-mode state, the checkbox list, field
// reset on success) runs for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SendNotificationForm } from "@/app/tomasz/SendNotificationForm";

describe("SendNotificationForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to 'Everyone' with the real registered-user count in the label", () => {
    render(<SendNotificationForm allEmails={["a@example.com", "b@example.com"]} />);
    expect(screen.getByLabelText(/Everyone \(2 users\)/)).toBeChecked();
  });

  it("singularises 'user' when exactly one is registered", () => {
    render(<SendNotificationForm allEmails={["a@example.com"]} />);
    expect(screen.getByLabelText(/Everyone \(1 user\)/)).toBeInTheDocument();
  });

  it("switching to 'Specific users' lists every real email as its own checkbox", async () => {
    const user = userEvent.setup();
    render(<SendNotificationForm allEmails={["a@example.com", "b@example.com"]} />);
    await user.click(screen.getByLabelText("Specific users"));

    expect(screen.getByLabelText("a@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("b@example.com")).toBeInTheDocument();
  });

  it("blocks submission with a specific message when 'Specific users' is chosen but none are ticked", async () => {
    vi.stubGlobal("confirm", vi.fn());
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<SendNotificationForm allEmails={["a@example.com"]} />);
    await user.type(screen.getByLabelText("Title"), "Heads up");
    await user.type(screen.getByLabelText("Message"), "Something changed.");
    await user.click(screen.getByLabelText("Specific users"));
    await user.click(screen.getByRole("button", { name: "Send notification" }));

    expect(await screen.findByText('Choose at least one recipient, or switch to "Everyone".')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("declining the confirm dialog aborts the send entirely", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<SendNotificationForm allEmails={["a@example.com", "b@example.com"]} />);
    await user.type(screen.getByLabelText("Title"), "Heads up");
    await user.type(screen.getByLabelText("Message"), "Something changed.");
    await user.click(screen.getByRole("button", { name: "Send notification" }));

    expect(confirm).toHaveBeenCalledWith("Send this to all 2 registered user(s)? This can't be undone.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("'Everyone': confirms, sends recipients:'all', and resets the form on success", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sentCount: 2 }) }));

    const user = userEvent.setup();
    render(<SendNotificationForm allEmails={["a@example.com", "b@example.com"]} />);
    await user.type(screen.getByLabelText("Title"), "Heads up");
    await user.type(screen.getByLabelText("Message"), "Something changed.");
    await user.type(screen.getByLabelText(/Link when clicked/), "/dashboard");
    await user.click(screen.getByRole("button", { name: "Send notification" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/send-notification",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Heads up", message: "Something changed.", linkTo: "/dashboard", recipients: "all" }),
      })
    );
    expect(await screen.findByText("Sent to 2 users.")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Message")).toHaveValue("");
    expect(screen.getByLabelText(/Link when clicked/)).toHaveValue("");
  });

  it("'Specific users': confirms with the selected count and sends only the ticked emails", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sentCount: 1 }) }));

    const user = userEvent.setup();
    render(<SendNotificationForm allEmails={["a@example.com", "b@example.com"]} />);
    await user.type(screen.getByLabelText("Title"), "Hi");
    await user.type(screen.getByLabelText("Message"), "Just you.");
    await user.click(screen.getByLabelText("Specific users"));
    await user.click(screen.getByLabelText("b@example.com"));
    await user.click(screen.getByRole("button", { name: "Send notification" }));

    expect(confirm).toHaveBeenCalledWith("Send this to 1 selected user(s)? This can't be undone.");
    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/send-notification",
      expect.objectContaining({
        body: JSON.stringify({ title: "Hi", message: "Just you.", linkTo: undefined, recipients: ["b@example.com"] }),
      })
    );
    expect(await screen.findByText("Sent to 1 user.")).toBeInTheDocument();
  });

  it("a link that's only whitespace is sent as undefined rather than a blank string", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sentCount: 1 }) }));

    const user = userEvent.setup();
    render(<SendNotificationForm allEmails={["a@example.com"]} />);
    await user.type(screen.getByLabelText("Title"), "Hi");
    await user.type(screen.getByLabelText("Message"), "Test.");
    await user.type(screen.getByLabelText(/Link when clicked/), "   ");
    await user.click(screen.getByRole("button", { name: "Send notification" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/send-notification",
      expect.objectContaining({
        body: JSON.stringify({ title: "Hi", message: "Test.", linkTo: undefined, recipients: "all" }),
      })
    );
  });

  it("shows the server's own error message when the API responds not-ok, without resetting the form", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Notification service unavailable." }) })
    );

    const user = userEvent.setup();
    render(<SendNotificationForm allEmails={["a@example.com"]} />);
    await user.type(screen.getByLabelText("Title"), "Hi");
    await user.type(screen.getByLabelText("Message"), "Test.");
    await user.click(screen.getByRole("button", { name: "Send notification" }));

    expect(await screen.findByText("Notification service unavailable.")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Hi");
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const user = userEvent.setup();
    render(<SendNotificationForm allEmails={["a@example.com"]} />);
    await user.type(screen.getByLabelText("Title"), "Hi");
    await user.type(screen.getByLabelText("Message"), "Test.");
    await user.click(screen.getByRole("button", { name: "Send notification" }));

    expect(await screen.findByText("Couldn't reach the server. Try again.")).toBeInTheDocument();
  });

  it("shows a note that there are no registered users when the specific-recipients list is empty", async () => {
    const user = userEvent.setup();
    render(<SendNotificationForm allEmails={[]} />);
    await user.click(screen.getByLabelText("Specific users"));

    expect(screen.getByText("No registered users found.")).toBeInTheDocument();
  });
});
