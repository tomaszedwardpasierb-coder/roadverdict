// Place at: tests/components/ImpersonateButton.test.tsx
//
// A high-stakes admin action: this button logs the admin in as another
// user's account. The API side (/api/tomasz/impersonate) already has
// its own authorization tests - this file only covers the button's own
// UI contract: it must not fire without an explicit, email-specific
// confirmation, must surface the server's own error text rather than a
// generic one, and must not navigate anywhere unless the server says
// the impersonation actually started. Only `fetch`, window.confirm, and
// next/navigation's useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { ImpersonateButton } from "@/app/tomasz/ImpersonateButton";

describe("ImpersonateButton", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for confirmation naming the exact account before doing anything else", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Impersonate" }));

    expect(confirm).toHaveBeenCalledWith(
      "View the app as rider@example.com? You'll be logged in as this account until you exit impersonation."
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("on confirm, posts the exact email and, on success, navigates to /dashboard", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Impersonate" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/impersonate",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "rider@example.com" }),
      })
    );
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows the running state (…) with the button disabled while the request is in flight", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    let resolveFetch: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }))
    );

    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Impersonate" }));

    const button = await screen.findByRole("button", { name: "…" });
    expect(button).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
  });

  it("on a not-ok response, shows the server's own error text and does NOT navigate away", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "That account no longer exists." }) })
    );

    const user = userEvent.setup();
    render(<ImpersonateButton email="ghost@example.com" />);
    await user.click(screen.getByRole("button", { name: "Impersonate" }));

    expect(await screen.findByText("That account no longer exists.")).toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Impersonate" })).not.toBeDisabled();
  });

  it("falls back to a generic error when a not-ok response has no error field", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Impersonate" }));

    expect(await screen.findByText("Could not start impersonation.")).toBeInTheDocument();
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws, and does not navigate", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Impersonate" }));

    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
