// Place at: tests/components/ResetDemoButton.test.tsx
//
// Demo-account reset trigger. Confirmation, fetch, and the page-refresh
// vs alert branches all run for real - only window.confirm/alert and
// fetch/next-navigation are stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ResetDemoButton } from "@/app/dashboard/ResetDemoButton";

describe("ResetDemoButton", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refresh.mockClear();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does nothing if the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<ResetDemoButton />);
    await user.click(screen.getByRole("button", { name: "↺ Reset Demo" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("on confirmation, POSTs to /api/demo/reset and refreshes the page on success", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ResetDemoButton />);
    await user.click(screen.getByRole("button", { name: "↺ Reset Demo" }));

    expect(fetch).toHaveBeenCalledWith("/api/demo/reset", { method: "POST" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("alerts instead of refreshing when the server responds not-ok", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<ResetDemoButton />);
    await user.click(screen.getByRole("button", { name: "↺ Reset Demo" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("Could not reset the demo right now. Please try again."));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("alerts with a connection-specific message when fetch itself throws", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    render(<ResetDemoButton />);
    await user.click(screen.getByRole("button", { name: "↺ Reset Demo" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("Could not reach the server."));
  });
});
