// Place at: tests/components/PlanComparisonCards.test.tsx
//
// The Free vs Pro comparison shown on /pro and reused inline by every
// ProGate. Its own tests live separately from ProGate's so the shared
// component's behavior (CTA state, feature list, the free-CTA toggle)
// isn't re-verified redundantly at every call site.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanComparisonCards } from "@/components/PlanComparisonCards";
import { PRO_FEATURES } from "@/lib/subscriptions";

describe("PlanComparisonCards", () => {
  it("lists every real Pro feature from subscriptions.ts, not a hardcoded copy", () => {
    render(<PlanComparisonCards userIsPro={false} />);
    for (const feature of PRO_FEATURES) {
      expect(screen.getByText(feature)).toBeInTheDocument();
    }
  });

  it("shows real Stripe subscribe buttons (monthly and annual) when the viewer isn't Pro yet", () => {
    render(<PlanComparisonCards userIsPro={false} />);
    expect(screen.getByRole("button", { name: /Subscribe monthly/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Subscribe annually/ })).toBeEnabled();
    expect(screen.queryByText("You're on Premium")).not.toBeInTheDocument();
  });

  it("shows 'You're on Premium' instead of subscribe buttons when the viewer already has Pro", () => {
    render(<PlanComparisonCards userIsPro />);
    expect(screen.getByText("You're on Premium")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Subscribe/ })).not.toBeInTheDocument();
  });

  it("shows a plain note, not a billing-portal link, for Pro access that isn't a real Stripe subscription (e.g. an admin grant)", () => {
    render(<PlanComparisonCards userIsPro hasStripeSubscription={false} />);
    expect(screen.getByText("Your account already has full Premium access.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
  });

  it("shows a 'Manage billing' link instead of the plain note for a real Stripe subscription", () => {
    render(<PlanComparisonCards userIsPro hasStripeSubscription />);
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument();
    expect(screen.queryByText("Your account already has full Premium access.")).not.toBeInTheDocument();
  });

  it("shows the Free card's 'Go to dashboard' link by default", () => {
    render(<PlanComparisonCards userIsPro={false} />);
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("hides the Free card's 'Go to dashboard' link when showFreeCta is false", () => {
    render(<PlanComparisonCards userIsPro={false} showFreeCta={false} />);
    expect(screen.queryByRole("link", { name: "Go to dashboard" })).not.toBeInTheDocument();
  });
});
