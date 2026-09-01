// Place at: tests/components/AdminLoginForm.test.tsx
//
// The two-step password-then-TOTP admin login flow. The API side of
// each step already has its own route tests (admin-login-password and
// admin-login-totp). This file covers the form's own job: which step
// shows at a time, that the password step's own error keeps the user
// on that step (never advancing to TOTP on failure), and that only a
// TOTP success navigates away. Only `fetch` and next/navigation's
// useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { AdminLoginForm } from "@/app/tomasz/login/AdminLoginForm";

describe("AdminLoginForm", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockRouter.refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts on the password step", () => {
    render(<AdminLoginForm />);
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByLabelText("Authenticator code")).not.toBeInTheDocument();
  });

  it("a wrong password shows the server's own error and stays on the password step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Incorrect password." }) })
    );

    const user = userEvent.setup();
    render(<AdminLoginForm />);
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect password.");
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByLabelText("Authenticator code")).not.toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("a correct password advances to the TOTP step without navigating away yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const user = userEvent.setup();
    render(<AdminLoginForm />);
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByLabelText("Authenticator code")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/login-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ password: "correct-password" }),
      })
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("a connection error on the password step shows a generic message and stays put", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const user = userEvent.setup();
    render(<AdminLoginForm />);
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  async function advanceToTotpStep(user: ReturnType<typeof userEvent.setup>) {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<AdminLoginForm />);
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByLabelText("Authenticator code");
  }

  it("a wrong TOTP code shows the server's own error and stays on the TOTP step, without navigating", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    await advanceToTotpStep(user);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid code." }),
    });
    await user.type(screen.getByLabelText("Authenticator code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid code.");
    expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("a correct TOTP code navigates to /tomasz and refreshes", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    await advanceToTotpStep(user);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await user.type(screen.getByLabelText("Authenticator code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await screen.findByRole("button", { name: "Verify" }); // settle the submit's async state update first
    expect(mockRouter.push).toHaveBeenCalledWith("/tomasz");
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/admin/login-totp",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "123456" }),
      })
    );
  });

  it("a connection error on the TOTP step shows a generic message and stays on that step", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    await advanceToTotpStep(user);

    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    await user.type(screen.getByLabelText("Authenticator code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
