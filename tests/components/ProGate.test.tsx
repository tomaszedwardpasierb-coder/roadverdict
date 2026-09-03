// Place at: tests/components/ProGate.test.tsx
//
// ProGate is the single reusable gate wrapping every Pro-only dashboard
// feature (Reports, Story So Far, reminder due-dates, the category spend
// breakdown, and the embedded Quote Checker/Cost Calculator/Buying Guide) -
// a regression here (e.g. an inverted isPro check) would silently unlock
// or lock every one of those features at once.
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
    expect(screen.queryByText(/Upgrade to Pro/)).not.toBeInTheDocument();
  });

  it("hides the real children behind an upsell card, linking to /pro, when isPro is false", () => {
    render(
      <ProGate featureName="Quote Checker" description="Some feature description." isPro={false}>
        <div>Real feature content</div>
      </ProGate>
    );
    expect(screen.queryByText("Real feature content")).not.toBeInTheDocument();
    expect(screen.getByText("Quote Checker")).toBeInTheDocument();
    expect(screen.getByText("Some feature description.")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /Upgrade to Pro/ });
    expect(link).toHaveAttribute("href", "/pro");
  });
});
