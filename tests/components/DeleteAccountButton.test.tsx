// Place at: tests/components/DeleteAccountButton.test.tsx
//
// The one irreversible admin action - this must never fire on a plain
// yes/no confirm the way most other admin buttons do. Only window.
// prompt/alert, fetch, and useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

import { DeleteAccountButton } from "@/app/tomasz/DeleteAccountButton";

describe("DeleteAccountButton", () => {
  beforeEach(() => mockRouter.refresh.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("does nothing if the prompt is dismissed (null)", async () => {
    vi.stubGlobal("prompt", vi.fn(() => null));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<DeleteAccountButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("alerts and does not call the API when the typed email doesn't match", async () => {
    vi.stubGlobal("prompt", vi.fn(() => "wrong@example.com"));
    const alertMock = vi.fn();
    vi.stubGlobal("alert", alertMock);
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<DeleteAccountButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(alertMock).toHaveBeenCalledWith("That didn't match - nothing was deleted.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("matches case/whitespace-insensitively and deletes on success", async () => {
    vi.stubGlobal("prompt", vi.fn(() => "  Rider@Example.com  "));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));

    const user = userEvent.setup();
    render(<DeleteAccountButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/accounts/delete",
      expect.objectContaining({ body: JSON.stringify({ email: "rider@example.com", confirmEmail: "  Rider@Example.com  " }) })
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("shows the server's error text and does not refresh on failure", async () => {
    vi.stubGlobal("prompt", vi.fn(() => "rider@example.com"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Something went wrong." } ) }));

    const user = userEvent.setup();
    render(<DeleteAccountButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
