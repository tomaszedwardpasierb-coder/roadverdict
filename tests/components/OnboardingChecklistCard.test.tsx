// Place at: tests/components/OnboardingChecklistCard.test.tsx
//
// Only fetch and next/navigation's useRouter are mocked. Item-done state
// comes purely from the completedSteps prop (never a "mark as done"
// click of its own) - see markOnboardingStepComplete's call sites
// (14 log-entry routes, the assistant route, both share-link routes,
// the compare page) and useMarkOnboardingStepSeen for how a step
// actually gets into that array in production.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { OnboardingChecklistCard } from "@/app/dashboard/OnboardingChecklistCard";

describe("OnboardingChecklistCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows progress out of six, and ticks only the completed steps", () => {
    render(<OnboardingChecklistCard completedSteps={["logged-first-entry", "used-ai-assistant"]} dismissed={false} />);

    expect(screen.getByText("2 of 6 done")).toBeInTheDocument();
    expect(screen.getByText("Getting started")).toBeInTheDocument();
    expect(screen.getByText("Log your first bit of history")).toBeInTheDocument();
    expect(screen.getByText("Compare two vehicles")).toBeInTheDocument();
  });

  it("shows a congratulatory title once every step is done", () => {
    render(
      <OnboardingChecklistCard
        completedSteps={["logged-first-entry", "used-ai-assistant", "compared-vehicles", "created-share-link", "viewed-report", "explored-transfer"]}
        dismissed={false}
      />
    );
    expect(screen.getByText("You're all set!")).toBeInTheDocument();
    expect(screen.getByText("6 of 6 done")).toBeInTheDocument();
  });

  it("renders as a collapsed pill, not the full card, when already dismissed", () => {
    render(<OnboardingChecklistCard completedSteps={["logged-first-entry"]} dismissed={true} />);

    expect(screen.queryByText("Getting started")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Getting started \(1\/6\) · show again/ })).toBeInTheDocument();
  });

  it("hiding the card posts dismissed: true and refreshes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const user = userEvent.setup();
    render(<OnboardingChecklistCard completedSteps={[]} dismissed={false} />);

    await user.click(screen.getByRole("button", { name: "Hide" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/onboarding/dismiss",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ dismissed: true }) })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("clicking the collapsed pill posts dismissed: false and refreshes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const user = userEvent.setup();
    render(<OnboardingChecklistCard completedSteps={[]} dismissed={true} />);

    await user.click(screen.getByRole("button", { name: /show again/ }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/onboarding/dismiss",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ dismissed: false }) })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
