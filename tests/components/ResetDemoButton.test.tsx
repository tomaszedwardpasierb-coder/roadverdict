// Place at: tests/components/ResetDemoButton.test.tsx
//
// Demo-account reset trigger. Confirmation, fetch, and the page-refresh
// vs alert branches all run for real - only window.confirm/alert and
// fetch/next-navigation are stubbed.
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ResetDemoButton } from "@/app/dashboard/ResetDemoButton";
import { ActiveSectionProvider, useActiveSection } from "@/components/ActiveSectionContext";

// Mirrors AssistantWidget.test.tsx's own SetVehicleKind helper - a real
// child calling the real setter, the same way DashboardShell does in
// production, rather than a mock.
function SetVehicleKind({ kind }: { kind: "bike" | "car" }) {
  const { setVehicleKind } = useActiveSection();
  useEffect(() => setVehicleKind(kind), [kind, setVehicleKind]);
  return null;
}

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

  // Rendered with no ActiveSectionProvider (as above), useActiveSection's
  // no-provider fallback (vehicleKind: null) applies, which defaults to
  // the bike wheel - a perfectly valid thing to assert on directly.
  it("shows the bike spinner while the reset request is in flight, with no provider in scope", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<ResetDemoButton />);
    await user.click(screen.getByRole("button", { name: "↺ Reset Demo" }));

    const button = screen.getByRole("button", { name: "Resetting…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button.querySelectorAll("path").length).toBe(0); // bike wheel, not car

    resolveFetch({ ok: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the car spinner while resetting when the dashboard's active vehicle is a car", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(
      <ActiveSectionProvider>
        <SetVehicleKind kind="car" />
        <ResetDemoButton />
      </ActiveSectionProvider>
    );
    await user.click(screen.getByRole("button", { name: "↺ Reset Demo" }));

    const button = screen.getByRole("button", { name: "Resetting…" });
    expect(button.querySelectorAll("path").length).toBeGreaterThan(0); // car wheel

    resolveFetch({ ok: true });
  });
});
