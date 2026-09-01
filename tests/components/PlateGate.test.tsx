// Place at: tests/components/PlateGate.test.tsx
//
// The plate-confirmation gate a report viewer must pass before seeing
// report details - fronts the plate-gate cookie set server-side by
// /api/report/[token]/verify-plate. On success this reloads the page
// (letting the server re-check the now-set cookie) rather than
// rendering anything client-side itself. Only `fetch` and
// window.location.reload are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlateGate } from "@/app/report/[token]/PlateGate";

describe("PlateGate", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the confirmation form for the given token's report", () => {
    render(<PlateGate token="abc123" />);
    expect(screen.getByText("Confirm you have the right bike")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. AB12 CDE")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. AB12 CDE")).toBeRequired();
  });

  it("submits the entered plate to this report's verify-plate endpoint and reloads on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });

    const user = userEvent.setup();
    render(<PlateGate token="abc123" />);
    await user.type(screen.getByPlaceholderText("e.g. AB12 CDE"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "View report" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/report/abc123/verify-plate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ plate: "AB12CDE" }),
      })
    );
    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
  });

  it("shows the server's own error message and does not reload when the plate doesn't match", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "That registration doesn't match this report." }),
    });

    const user = userEvent.setup();
    render(<PlateGate token="abc123" />);
    await user.type(screen.getByPlaceholderText("e.g. AB12 CDE"), "WRONG1");
    await user.click(screen.getByRole("button", { name: "View report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That registration doesn't match this report.");
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(<PlateGate token="abc123" />);
    await user.type(screen.getByPlaceholderText("e.g. AB12 CDE"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "View report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
  });

  it("shows a disabled, busy submit button while the request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const user = userEvent.setup();
    render(<PlateGate token="abc123" />);
    await user.type(screen.getByPlaceholderText("e.g. AB12 CDE"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "View report" }));

    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    resolveFetch({ ok: true, json: async () => ({}) });
    await screen.findByRole("button", { name: "View report" });
  });
});
