// Place at: tests/components/LogoutButton.test.tsx
//
// The dashboard's own sign-out trigger (distinct from the admin-only
// AdminLogoutButton, which has its own test file). Rendered directly by
// DashboardShell for both a bike-active and a car-active session, so its
// spinner is read from the shared ActiveSectionContext rather than
// hardcoded - see AssistantWidget.test.tsx's own SetVehicleKind helper
// for the pattern mirrored below. Only `fetch` and next/navigation's
// useRouter are mocked.
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import LogoutButton from "@/app/dashboard/LogoutButton";
import { ActiveSectionProvider, useActiveSection } from "@/components/ActiveSectionContext";

function SetVehicleKind({ kind }: { kind: "bike" | "car" }) {
  const { setVehicleKind } = useActiveSection();
  useEffect(() => setVehicleKind(kind), [kind, setVehicleKind]);
  return null;
}

describe("LogoutButton", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    push.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the logout endpoint and navigates to /login", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<LogoutButton />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(push).toHaveBeenCalledWith("/login");
  });

  // Rendered with no ActiveSectionProvider, useActiveSection's
  // no-provider fallback (vehicleKind: null) applies, which defaults to
  // the bike wheel.
  it("shows the bike spinner while signing out, with no provider in scope", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<LogoutButton />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    const button = screen.getByRole("button", { name: "Signing out..." });
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button.querySelectorAll("path").length).toBe(0); // bike wheel, not car

    // handleLogout never resets loading back to false (the page is
    // expected to navigate away via router.push) - so this only checks
    // that the navigation itself follows, not a return to "Sign out".
    resolveFetch({ ok: true });
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });

  it("shows the car spinner while signing out, when the dashboard's active vehicle is a car", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(
      <ActiveSectionProvider>
        <SetVehicleKind kind="car" />
        <LogoutButton />
      </ActiveSectionProvider>
    );
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    const button = screen.getByRole("button", { name: "Signing out..." });
    expect(button.querySelectorAll("path").length).toBeGreaterThan(0); // car wheel

    resolveFetch({ ok: true });
  });
});
