// Place at: tests/components/BlockAccountButton.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

import { BlockAccountButton } from "@/app/tomasz/BlockAccountButton";

describe("BlockAccountButton", () => {
  beforeEach(() => mockRouter.refresh.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("shows 'Block' when not blocked, and confirms with the block-specific message", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<BlockAccountButton email="rider@example.com" blocked={false} />);
    await user.click(screen.getByRole("button", { name: "Block" }));

    expect(confirm).toHaveBeenCalledWith(
      "Block rider@example.com? They'll be signed out immediately and won't be able to sign back in until unblocked."
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows 'Unblock' when already blocked, and confirms with the unblock-specific message", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<BlockAccountButton email="rider@example.com" blocked />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Unblock" }));
    expect(confirm).toHaveBeenCalledWith("Unblock rider@example.com? They'll be able to sign in again.");
  });

  it("posts the toggled blocked value and refreshes on success", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));

    const user = userEvent.setup();
    render(<BlockAccountButton email="rider@example.com" blocked={false} />);
    await user.click(screen.getByRole("button", { name: "Block" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/accounts/block",
      expect.objectContaining({ body: JSON.stringify({ email: "rider@example.com", blocked: true }) })
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("shows the server's error text and does not refresh on failure", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "No account found." }) }));

    const user = userEvent.setup();
    render(<BlockAccountButton email="rider@example.com" blocked={false} />);
    await user.click(screen.getByRole("button", { name: "Block" }));

    expect(await screen.findByText("No account found.")).toBeInTheDocument();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
