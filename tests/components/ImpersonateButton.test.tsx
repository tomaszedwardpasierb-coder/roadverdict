// Place at: tests/components/ImpersonateButton.test.tsx
//
// A high-stakes admin action: this button logs the admin in as another
// user's account. The API side (/api/tomasz/impersonate) already has
// its own re-auth/rate-limit tests - this file only covers the button's
// own UI contract: it opens a step-up re-auth modal (password, TOTP,
// reason) rather than firing on a bare click, the confirm button stays
// disabled until all three are filled in, it posts exactly those
// fields, and it surfaces the server's own error text rather than a
// generic one. Only `fetch` and next/navigation's useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { ImpersonateButton } from "@/app/tomasz/ImpersonateButton";

async function openModalAndFillIn(user: ReturnType<typeof userEvent.setup>, { password = "correct-password", totpCode = "123456", reason = "checking a ticket" } = {}) {
  await user.click(screen.getByRole("button", { name: "Impersonate" }));
  if (password) await user.type(screen.getByLabelText("Your password"), password);
  if (totpCode) await user.type(screen.getByLabelText("Authenticator code"), totpCode);
  if (reason) await user.type(screen.getByLabelText("Reason"), reason);
}

describe("ImpersonateButton", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a re-auth modal naming the exact account, without firing anything, on the initial click", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);

    await user.click(screen.getByRole("button", { name: "Impersonate" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/View the app as rider@example.com\?/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the confirm button disabled until password, code, and reason are all filled in", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Impersonate" }));

    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Your password"), "correct-password");
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Authenticator code"), "123456");
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Reason"), "checking a ticket");
    expect(confirmButton).toBeEnabled();
  });

  it("cancelling closes the modal without ever calling fetch", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);
    await openModalAndFillIn(user);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("on confirm, posts the email, password, code, and trimmed reason, and on success navigates to /dashboard", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);
    await openModalAndFillIn(user, { reason: "  checking a ticket  " });

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/impersonate",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "rider@example.com", password: "correct-password", totpCode: "123456", reason: "checking a ticket" }),
      })
    );
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows the running state (…) with the confirm button disabled while the request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; })));

    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);
    await openModalAndFillIn(user);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    const runningButton = await screen.findByRole("button", { name: "…" });
    expect(runningButton).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
  });

  it("on a not-ok response, shows the server's own error text, does NOT navigate away, and leaves the modal open", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Incorrect password." }) }));
    const user = userEvent.setup();
    render(<ImpersonateButton email="ghost@example.com" />);
    await openModalAndFillIn(user);

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Incorrect password.")).toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("falls back to a generic error when a not-ok response has no error field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);
    await openModalAndFillIn(user);

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Could not start impersonation.")).toBeInTheDocument();
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws, and does not navigate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const user = userEvent.setup();
    render(<ImpersonateButton email="rider@example.com" />);
    await openModalAndFillIn(user);

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
