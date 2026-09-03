// Place at: tests/components/ResetStoryCooldownButton.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

import { ResetStoryCooldownButton } from "@/app/tomasz/ResetStoryCooldownButton";

describe("ResetStoryCooldownButton", () => {
  beforeEach(() => mockRouter.refresh.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("does not call the API if the confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<ResetStoryCooldownButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Unlock Story regen" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the email and refreshes on success", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, bikesReset: 1 }) }));

    const user = userEvent.setup();
    render(<ResetStoryCooldownButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Unlock Story regen" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/reset-story-cooldown",
      expect.objectContaining({ body: JSON.stringify({ email: "rider@example.com" }) })
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("shows the server's error text and does not refresh on failure", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "No bikes found for that account." }) }));

    const user = userEvent.setup();
    render(<ResetStoryCooldownButton email="rider@example.com" />);
    await user.click(screen.getByRole("button", { name: "Unlock Story regen" }));

    expect(await screen.findByText("No bikes found for that account.")).toBeInTheDocument();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
