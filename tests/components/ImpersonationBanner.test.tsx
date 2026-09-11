// Place at: tests/components/ImpersonationBanner.test.tsx
//
// The sticky banner shown while an admin is impersonating another
// account - covers the exit action's fetch/navigation and the busy-state
// visual feedback while it's in flight. Only `fetch` and next/navigation's
// useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

import { ImpersonationBanner } from "@/app/ImpersonationBanner";

describe("ImpersonationBanner", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockRouter.refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows which account is being impersonated", () => {
    render(<ImpersonationBanner email="rider@example.com" />);
    expect(screen.getByText("rider@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exit impersonation" })).toBeInTheDocument();
  });

  it("on exit, calls the impersonate DELETE endpoint then navigates back to /tomasz and refreshes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const user = userEvent.setup();
    render(<ImpersonationBanner email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Exit impersonation" }));

    expect(fetch).toHaveBeenCalledWith("/api/tomasz/impersonate", { method: "DELETE" });
    expect(mockRouter.push).toHaveBeenCalledWith("/tomasz");
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("shows the spinner alongside the button's own 'Exiting…' text while the request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }))
    );
    const user = userEvent.setup();
    render(<ImpersonationBanner email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Exit impersonation" }));

    const busyButton = screen.getByRole("button", { name: "Exiting…" });
    expect(busyButton).toBeDisabled();
    expect(busyButton.querySelector("svg")).toBeInTheDocument();

    resolveFetch({ ok: true });
    // The button's own loading state is never reset back to false in this
    // component - it relies on the router.push/refresh below to navigate
    // away instead, so that's what we wait for rather than a text revert.
    await vi.waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/tomasz"));
    expect(mockRouter.refresh).toHaveBeenCalled();
  });
});
