// Place at: tests/components/CostBreakdownResult.test.tsx
//
// CostCalculatorForm.test.tsx already exercises this indirectly with
// advice=null. This file covers the advice-present branches, and pins
// down every line item actually renders from the real breakdown object
// rather than a hardcoded subset.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CostBreakdownResult } from "@/components/CostBreakdownResult";

const breakdown = { servicing: 150, tyres: 120, mot: 30, tax: 40, fuel: 280, total: 620 };

describe("CostBreakdownResult", () => {
  it("renders every real line item plus the total, and marks insurance as excluded", () => {
    render(
      <CostBreakdownResult breakdown={breakdown} brandLabel="Honda" regionLabel="Scotland & Northern Ireland" advice={null} />
    );
    expect(screen.getByText("£150")).toBeInTheDocument();
    expect(screen.getByText("£120")).toBeInTheDocument();
    expect(screen.getByText("£30")).toBeInTheDocument();
    expect(screen.getByText("£40")).toBeInTheDocument();
    expect(screen.getByText("£280")).toBeInTheDocument();
    expect(screen.getByText("£620")).toBeInTheDocument();
    expect(screen.getByText("not included")).toBeInTheDocument();
  });

  it("renders advice with watch-out-for points when present", () => {
    render(
      <CostBreakdownResult
        breakdown={breakdown}
        brandLabel="Honda"
        regionLabel="Scotland & Northern Ireland"
        advice={{ explanation: "Most of this goes on servicing and tyres.", watchOutFor: ["Chain kits wear faster on this model."] }}
      />
    );
    expect(screen.getByText("Most of this goes on servicing and tyres.")).toBeInTheDocument();
    expect(screen.getByText("Chain kits wear faster on this model.")).toBeInTheDocument();
  });

  it("omits the watch-out-for heading when advice has no points", () => {
    render(
      <CostBreakdownResult
        breakdown={breakdown}
        brandLabel="Honda"
        regionLabel="Scotland & Northern Ireland"
        advice={{ explanation: "Straightforward, no surprises for this class.", watchOutFor: [] }}
      />
    );
    expect(screen.getByText("Straightforward, no surprises for this class.")).toBeInTheDocument();
    expect(screen.queryByText("Worth knowing")).not.toBeInTheDocument();
  });
});
