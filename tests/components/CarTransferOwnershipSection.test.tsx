// Mirrors TransferOwnershipSection.test.tsx for the car equivalent component.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarTransferOwnershipSection } from "@/app/dashboard/CarTransferOwnershipSection";

describe("CarTransferOwnershipSection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a read-only (already-transferred) car shows only the notice - no form, and no pending-request text even if one is passed", () => {
    render(
      <CarTransferOwnershipSection
        carIsReadOnly={true}
        pendingRequest={{ recipientEmail: "buyer@example.com", createdAt: "2026-01-01T00:00:00.000Z" }}
      />
    );
    expect(screen.getByText(/already been transferred and can't be offered again/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start handover" })).not.toBeInTheDocument();
    expect(screen.queryByText("buyer@example.com")).not.toBeInTheDocument();
  });

  it("with no pending request, shows the offer form with 'include my records' checked by default", () => {
    render(<CarTransferOwnershipSection carIsReadOnly={false} pendingRequest={null} />);
    expect(screen.getByPlaceholderText("buyer@example.com")).toHaveValue("");
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("button", { name: "Start handover" })).toBeInTheDocument();
  });

  it("rejects an email with no '@' client-side, without ever calling fetch", async () => {
    const user = userEvent.setup();
    render(<CarTransferOwnershipSection carIsReadOnly={false} pendingRequest={null} />);
    await user.type(screen.getByPlaceholderText("buyer@example.com"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Start handover" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits recipientEmail and the includeRecords choice, then shows the optimistic waiting state with the correct excluded-records wording", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarTransferOwnershipSection carIsReadOnly={false} pendingRequest={null} />);
    await user.type(screen.getByPlaceholderText("buyer@example.com"), "buyer@example.com");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Start handover" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-transfer",
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

  it("shows the car spinner on Start handover while the request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<CarTransferOwnershipSection carIsReadOnly={false} pendingRequest={null} />);
    await user.type(screen.getByPlaceholderText("buyer@example.com"), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: "Start handover" }));

    const button = screen.getByRole("button", { name: "Sending…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    resolveFetch({ ok: true, json: async () => ({}) });
    await screen.findByText(/Waiting for/);
  });

  it("an existing pending request from the server (includeRecords omitted) shows the 'records go with it too' wording, with no submission needed", () => {
    render(
      <CarTransferOwnershipSection
        carIsReadOnly={false}
        pendingRequest={{ recipientEmail: "already-offered@example.com", createdAt: "2026-01-15T00:00:00.000Z" }}
      />
    );
    expect(screen.getByText(/Waiting for/)).toBeInTheDocument();
    expect(screen.getByText("already-offered@example.com", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/logged service records, fuel logs, mods, bills, and any attached receipts go with it too/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the server's own error message on a not-ok response, and leaves the form in place to retry", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "That car already has a pending offer." }) });
    const user = userEvent.setup();
    render(<CarTransferOwnershipSection carIsReadOnly={false} pendingRequest={null} />);
    await user.type(screen.getByPlaceholderText("buyer@example.com"), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: "Start handover" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That car already has a pending offer.");
    expect(screen.getByRole("button", { name: "Start handover" })).toBeInTheDocument();
  });

  it("shows a generic connection-failed message when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<CarTransferOwnershipSection carIsReadOnly={false} pendingRequest={null} />);
    await user.type(screen.getByPlaceholderText("buyer@example.com"), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: "Start handover" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server. Try again.");
  });
});
