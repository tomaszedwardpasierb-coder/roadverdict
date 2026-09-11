// Place at: tests/components/CarAcceptDeclineForm.test.tsx
//
// Car mirror of bike-transfer/[token]/AcceptDeclineForm.tsx. Covers the
// sign-in-required, wrong-account, already-decided, and live
// accept/decline flows for a pending ownership-transfer offer. Only
// `fetch` is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarAcceptDeclineForm } from "@/app/car-transfer/[token]/CarAcceptDeclineForm";

describe("CarAcceptDeclineForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("when signed out, prompts to sign in with the recipient's email and only offers Decline", () => {
    render(<CarAcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail={null} />);

    expect(screen.getByText("buyer@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("when signed in as a different account, explains the mismatch and only offers Decline", () => {
    render(<CarAcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="other@example.com" />);

    expect(screen.getByText("other@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("when the offer has already been decided, shows a plain status message with no buttons", () => {
    render(<CarAcceptDeclineForm token="tok1" status="accepted" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);

    expect(screen.getByText("This offer has already been accepted.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("accepting posts to this transfer's accept endpoint and shows the accepted confirmation", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarAcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(fetch).toHaveBeenCalledWith("/api/cars/car-transfer/tok1/accept", { method: "POST" });
    expect(await screen.findByText(/now appears on your account/)).toBeInTheDocument();
  });

  it("declining posts to this transfer's decline endpoint and shows the declined confirmation", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarAcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);

    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(fetch).toHaveBeenCalledWith("/api/cars/car-transfer/tok1/decline", { method: "POST" });
    expect(await screen.findByText("Declined. Nothing has changed on either account.")).toBeInTheDocument();
  });

  it("shows the server's own error message when the decision fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "This offer is no longer valid." }) });
    const user = userEvent.setup();
    render(<CarAcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This offer is no longer valid.");
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<CarAcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);

    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the server/i);
  });

  // Accept and Decline share a single `submitting` flag - clicking either
  // one disables and re-labels both buttons, so both are asserted here
  // rather than assuming only the clicked one changes.
  it("shows the spinner on both buttons while Accept's request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<CarAcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    const buttons = screen.getAllByRole("button", { name: "Please wait…" });
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
      expect(button.querySelector("svg")).toBeInTheDocument();
    });

    resolveFetch({ ok: true, json: async () => ({}) });
    await screen.findByText(/now appears on your account/);
  });

  it("shows the spinner on both buttons while Decline's request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<CarAcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);

    await user.click(screen.getByRole("button", { name: "Decline" }));

    const buttons = screen.getAllByRole("button", { name: "Please wait…" });
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
      expect(button.querySelector("svg")).toBeInTheDocument();
    });

    resolveFetch({ ok: true, json: async () => ({}) });
    await screen.findByText("Declined. Nothing has changed on either account.");
  });
});
