// Place at: tests/components/ProGate.test.tsx
//
// ProGate is the single reusable gate wrapping every Pro-only dashboard
// feature (Reports, Story So Far, the embedded Quote Checker/Cost
// Calculator/Buying Guide, and the reminders comparison card) - a
// regression here (e.g. an inverted isPro check) would silently unlock
// or lock every one of those features at once. It renders the same
// Free vs Pro comparison shown on /pro (via the real PlanComparisonCards,
// not a stub) so the gate makes clear one subscription covers everything.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProGate } from "@/app/dashboard/ProGate";

describe("ProGate", () => {
  it("renders the real children and no upsell copy when isPro is true", () => {
    render(
      <ProGate featureName="Quote Checker" description="Some feature description." isPro>
        <div>Real feature content</div>
      </ProGate>
    );
    expect(screen.getByText("Real feature content")).toBeInTheDocument();
    expect(screen.queryByText("Quote Checker")).not.toBeInTheDocument();
    expect(screen.queryByText(/unlocks every locked feature/)).not.toBeInTheDocument();
  });

  it("hides the real children behind the feature name, description, and the Free/Pro comparison when isPro is false", () => {
    render(
      <ProGate featureName="Quote Checker" description="Some feature description." isPro={false}>
        <div>Real feature content</div>
      </ProGate>
    );
    expect(screen.queryByText("Real feature content")).not.toBeInTheDocument();
    expect(screen.getByText("Quote Checker")).toBeInTheDocument();
    expect(screen.getByText("Some feature description.")).toBeInTheDocument();
    expect(screen.getByText(/One Pro subscription unlocks every locked feature/)).toBeInTheDocument();

    // The real PlanComparisonCards, not a stub - both plan cards present.
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Most popular")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coming soon" })).toBeInTheDocument();
  });

  it("doesn't show the comparison card's own 'Go to dashboard' link, since the gate is already inside the dashboard", () => {
    render(
      <ProGate featureName="Quote Checker" description="Some feature description." isPro={false}>
        <div>Real feature content</div>
      </ProGate>
    );
    expect(screen.queryByRole("link", { name: "Go to dashboard" })).not.toBeInTheDocument();
  });
});
