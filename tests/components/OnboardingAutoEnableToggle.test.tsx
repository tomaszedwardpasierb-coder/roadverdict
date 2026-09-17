// Place at: tests/components/OnboardingAutoEnableToggle.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

import { OnboardingAutoEnableToggle } from "@/app/tomasz/OnboardingAutoEnableToggle";

describe("OnboardingAutoEnableToggle", () => {
  beforeEach(() => mockRouter.refresh.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("shows the checkbox unchecked when off, and asks for confirmation before turning it on", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<OnboardingAutoEnableToggle enabled={false} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();

    await user.click(screen.getByRole("checkbox"));

    expect(confirm).toHaveBeenCalledWith("Turn on the getting-started checklist for every new signup from now on?");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the checkbox checked when on, and turns it off with no confirmation needed", async () => {
    vi.stubGlobal("confirm", vi.fn());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));

    const user = userEvent.setup();
    render(<OnboardingAutoEnableToggle enabled={true} />);
    expect(screen.getByRole("checkbox")).toBeChecked();

    await user.click(screen.getByRole("checkbox"));

    expect(confirm).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/assistant-config/auto-enable-onboarding",
      expect.objectContaining({ body: JSON.stringify({ enabled: false }) })
    );
  });

  it("posts enabled: true and refreshes once confirmed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));

    const user = userEvent.setup();
    render(<OnboardingAutoEnableToggle enabled={false} />);
    await user.click(screen.getByRole("checkbox"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/assistant-config/auto-enable-onboarding",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ enabled: true }) })
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("shows the server's error text and does not refresh on failure", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Could not save." }) }));

    const user = userEvent.setup();
    render(<OnboardingAutoEnableToggle enabled={false} />);
    await user.click(screen.getByRole("checkbox"));

    expect(await screen.findByText("Could not save.")).toBeInTheDocument();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("shows a generic error when fetch itself throws", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const user = userEvent.setup();
    render(<OnboardingAutoEnableToggle enabled={false} />);
    await user.click(screen.getByRole("checkbox"));

    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
  });
});
