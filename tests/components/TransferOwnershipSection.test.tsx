// Place at: tests/components/TransferOwnershipSection.test.tsx
//
// The bike-ownership-handover initiation UI - flagged elsewhere in this
// codebase's history as the highest-stakes feature in the app, so its
// real branching (read-only bikes, an existing pending request, the
// includeRecords choice, and what actually gets sent to the server) is
// exercised for real here rather than assumed. Only `fetch` is mocked.
//
// Two things below are asserted as CURRENT BEHAVIOUR, not as approval -
// see the "weak client-side email validation" and "no cancel control"
// tests/comments for concerns worth a second look given the stakes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferOwnershipSection } from "@/app/dashboard/TransferOwnershipSection";

describe("TransferOwnershipSection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a read-only (already-transferred) bike shows only the notice - no form, and no pending-request text even if one is passed", () => {
    render(
      <TransferOwnershipSection
        bikeIsReadOnly={true}
        pendingRequest={{ recipientEmail: "buyer@example.com", createdAt: "2026-01-01T00:00:00.000Z" }}
      />
    );
    expect(screen.getByText(/already been transferred and can't be offered again/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start handover" })).not.toBeInTheDocument();
    expect(screen.queryByText("buyer@example.com")).not.toBeInTheDocument();
  });

  it("with no pending request, shows the offer form with 'include my records' checked by default", () => {
    render(<TransferOwnershipSection bikeIsReadOnly={false} pendingRequest={null} />);
    expect(screen.getByPlaceholderText("buyer@example.com")).toHaveValue("");
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("button", { name: "Start handover" })).toBeInTheDocument();
  });

  it("rejects an email with no '@' client-side, without ever calling fetch", async () => {
    const user = userEvent.setup();
    render(<TransferOwnershipSection bikeIsReadOnly={false} pendingRequest={null} />);
    await user.type(screen.getByPlaceholderText("buyer@example.com"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Start handover" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("CONCERN: the client-side check is only 'contains an @' - a bare '@' with nothing else passes it and reaches the server", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<TransferOwnershipSection bikeIsReadOnly={false} pendingRequest={null} />);
    await user.type(screen.getByPlaceholderText("buyer@example.com"), "@");
    await user.click(screen.getByRole("button", { name: "Start handover" }));

    // No client-side error is shown - the malformed address is sent as-is.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike-transfer",
      expect.objectContaining({ body: JSON.stringify({ recipientEmail: "@", includeRecords: true }) })
    );
  });

  it("submits recipientEmail and the includeRecords choice, then shows the optimistic waiting state with the correct excluded-records wording", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<TransferOwnershipSection bikeIsReadOnly={false} pendingRequest={null} />);
    await user.type(screen.getByPlaceholderText("buyer@example.com"), "buyer@example.com");
    await user.click(screen.getByRole("checkbox")); // untick "include my records"
    await user.click(screen.getByRole("button", { name: "Start handover" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike-transfer",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ recipientEmail: "buyer@example.com", includeRecords: false }),
      })
    );
    expect(await screen.findByText(/Waiting for/)).toBeInTheDocument();
    expect(screen.getByText("buyer@example.com", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/individual service records, fuel logs, mods, bills, and any attached receipts stay private/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start handover" })).not.toBeInTheDocument();
  });

  it("an existing pending request from the server (includeRecords omitted) shows the 'records go with it too' wording, with no submission needed", () => {
    render(
      <TransferOwnershipSection
        bikeIsReadOnly={false}
        pendingRequest={{ recipientEmail: "already-offered@example.com", createdAt: "2026-01-15T00:00:00.000Z" }}
      />
    );
    expect(screen.getByText(/Waiting for/)).toBeInTheDocument();
    expect(screen.getByText("already-offered@example.com", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/logged service records, fuel logs, mods, bills, and any attached receipts go with it too/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the server's own error message on a not-ok response, and leaves the form in place to retry", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "That bike already has a pending offer." }) });
    const user = userEvent.setup();
    render(<TransferOwnershipSection bikeIsReadOnly={false} pendingRequest={null} />);
    await user.type(screen.getByPlaceholderText("buyer@example.com"), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: "Start handover" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That bike already has a pending offer.");
    expect(screen.getByRole("button", { name: "Start handover" })).toBeInTheDocument(); // still offering, not switched to "waiting"
  });

  it("shows a generic connection-failed message when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<TransferOwnershipSection bikeIsReadOnly={false} pendingRequest={null} />);
    await user.type(screen.getByPlaceholderText("buyer@example.com"), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: "Start handover" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server. Try again.");
  });

  it("CONCERN: once an offer is sent (or already pending), there is no cancel/withdraw control anywhere in this component", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<TransferOwnershipSection bikeIsReadOnly={false} pendingRequest={null} />);
    await user.type(screen.getByPlaceholderText("buyer@example.com"), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: "Start handover" }));

    await screen.findByText(/Waiting for/);
    expect(screen.queryByRole("button")).not.toBeInTheDocument(); // no cancel/withdraw button rendered at all
  });
});
