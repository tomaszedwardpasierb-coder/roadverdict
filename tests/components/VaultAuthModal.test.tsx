// Place at: tests/components/VaultAuthModal.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultAuthModal } from "@/app/dashboard/VaultAuthModal";

describe("VaultAuthModal", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps Unlock disabled until a code is typed", async () => {
    const user = userEvent.setup();
    render(<VaultAuthModal vehicleKind="bike" onUnlocked={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
    await user.type(screen.getByLabelText(/6-digit code/), "123456");
    expect(screen.getByRole("button", { name: "Unlock" })).toBeEnabled();
  });

  it("posts the trimmed code to /api/vault/reauth and calls onUnlocked with the previous access on success", async () => {
    const previousAccess = { at: "2026-01-01T00:00:00.000Z", browser: "Firefox", country: "France" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true, previousAccess }) });
    const onUnlocked = vi.fn();
    const user = userEvent.setup();
    render(<VaultAuthModal vehicleKind="bike" onUnlocked={onUnlocked} />);

    await user.type(screen.getByLabelText(/6-digit code/), " 123456 ");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/vault/reauth",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "123456" }) })
    );
    expect(onUnlocked).toHaveBeenCalledWith(previousAccess);
  });

  it("shows the server's own error and does not call onUnlocked on an incorrect code", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Incorrect code." }) });
    const onUnlocked = vi.fn();
    const user = userEvent.setup();
    render(<VaultAuthModal vehicleKind="bike" onUnlocked={onUnlocked} />);

    await user.type(screen.getByLabelText(/6-digit code/), "000000");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect code.");
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it("shows a connection error when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    render(<VaultAuthModal vehicleKind="bike" onUnlocked={vi.fn()} />);

    await user.type(screen.getByLabelText(/6-digit code/), "123456");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach roadverdict/i);
  });

  it("shows the bike or car spinner on Unlock while the request is in flight, per the vehicleKind prop", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<VaultAuthModal vehicleKind="car" onUnlocked={vi.fn()} />);

    await user.type(screen.getByLabelText(/6-digit code/), "123456");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    const button = screen.getByRole("button", { name: "Confirming…" });
    expect(button.querySelectorAll("path").length).toBeGreaterThan(0); // car wheel

    resolveFetch({ ok: true, json: async () => ({ ok: true, previousAccess: null }) });
  });
});
