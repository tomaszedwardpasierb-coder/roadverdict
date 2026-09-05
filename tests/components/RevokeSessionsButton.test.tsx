// Place at: tests/components/RevokeSessionsButton.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

import { RevokeSessionsButton } from "@/app/tomasz/RevokeSessionsButton";

describe("RevokeSessionsButton", () => {
  beforeEach(() => mockRouter.refresh.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("confirms with a message naming the email before doing anything", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<RevokeSessionsButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Force re-auth" }));

    expect(confirm).toHaveBeenCalledWith(
      "Force rider@example.com to re-authenticate? They'll be signed out of every device immediately and need to sign in again next time."
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the email and refreshes on success", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, revokedCount: 2 }) }));

    const user = userEvent.setup();
    render(<RevokeSessionsButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Force re-auth" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/accounts/revoke-sessions",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "rider@example.com" }) })
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("shows the server's error text and does not refresh on failure", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "No account found." }) }));

    const user = userEvent.setup();
    render(<RevokeSessionsButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Force re-auth" }));

    expect(await screen.findByText("No account found.")).toBeInTheDocument();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const user = userEvent.setup();
    render(<RevokeSessionsButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Force re-auth" }));

    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
  });
});
