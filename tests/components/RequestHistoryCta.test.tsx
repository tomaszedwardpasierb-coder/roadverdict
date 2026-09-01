// Place at: tests/components/RequestHistoryCta.test.tsx
//
// The buyer-facing CTA on a shared report inviting them to carry a
// bike's history forward under their own account. Branches purely on
// signedInEmail (sign-in link vs. a real request button) and on
// whether the request has already been sent this session. Only
// `fetch` is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequestHistoryCta } from "@/app/report/[token]/RequestHistoryCta";

describe("RequestHistoryCta", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("when signed out, shows a sign-in link (with the current path as a redirect) instead of a request button", () => {
    render(<RequestHistoryCta registration="AB12CDE" signedInEmail={null} currentPath="/report/tok123" />);

    expect(screen.queryByRole("button", { name: /Request this bike's history/ })).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Sign in or create a free account/ });
    expect(link).toHaveAttribute("href", "/login?redirect=%2Freport%2Ftok123");
  });

  it("when signed in, shows the real request button and posts this report's registration", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const user = userEvent.setup();
    render(<RequestHistoryCta registration="AB12CDE" signedInEmail="buyer@example.com" currentPath="/report/tok123" />);
    await user.click(screen.getByRole("button", { name: "Request this bike's history" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike-transfer/request-ownership",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ registration: "AB12CDE" }),
      })
    );
    expect(await screen.findByText("Request sent")).toBeInTheDocument();
  });

  it("shows the server's own error message and stays on the request button when the request fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "You already have a pending request for this bike." }),
    });

    const user = userEvent.setup();
    render(<RequestHistoryCta registration="AB12CDE" signedInEmail="buyer@example.com" currentPath="/report/tok123" />);
    await user.click(screen.getByRole("button", { name: "Request this bike's history" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You already have a pending request for this bike.");
    expect(screen.getByRole("button", { name: "Request this bike's history" })).toBeInTheDocument();
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(<RequestHistoryCta registration="AB12CDE" signedInEmail="buyer@example.com" currentPath="/report/tok123" />);
    await user.click(screen.getByRole("button", { name: "Request this bike's history" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the server/i);
  });

  it("once sent, no longer shows the request button even if re-rendered with the same props", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const user = userEvent.setup();
    render(<RequestHistoryCta registration="AB12CDE" signedInEmail="buyer@example.com" currentPath="/report/tok123" />);
    await user.click(screen.getByRole("button", { name: "Request this bike's history" }));

    await screen.findByText("Request sent");
    expect(screen.queryByRole("button", { name: "Request this bike's history" })).not.toBeInTheDocument();
  });
});
