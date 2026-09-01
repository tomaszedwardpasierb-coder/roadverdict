// Place at: tests/components/VerdictResult.test.tsx
//
// QuoteForm.test.tsx already exercises VerdictResult indirectly with a
// bare-minimum payload (communityStats/advice both null). This file
// covers the branches that leaves untouched: communityStats present,
// and advice present both with and without follow-up questions.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerdictResult } from "@/components/VerdictResult";

const baseProps = {
  verdict: "high" as const,
  range: { low: 100, high: 200 },
  quotedPrice: 350,
  brandLabel: "Ducati",
  regionLabel: "London & South East",
};

describe("VerdictResult", () => {
  it("renders community stats when present", () => {
    render(
      <VerdictResult
        {...baseProps}
        communityStats={{ sampleSize: 12, low: 150, high: 220 }}
        advice={null}
      />
    );
    expect(screen.getByText(/12 riders on RoadVerdict/)).toBeInTheDocument();
    expect(screen.getByText(/£150–£220/)).toBeInTheDocument();
  });

  it("omits the community-stats line entirely when there isn't enough data", () => {
    render(<VerdictResult {...baseProps} communityStats={null} advice={null} />);
    expect(screen.queryByText(/riders on RoadVerdict/)).not.toBeInTheDocument();
  });

  it("renders advice with its follow-up questions list", () => {
    render(
      <VerdictResult
        {...baseProps}
        communityStats={null}
        advice={{ explanation: "Ducati parts and labour run higher across the board.", questionsToAsk: ["Is this an OEM or aftermarket part?", "Was VAT included?"] }}
      />
    );
    expect(screen.getByText("Ducati parts and labour run higher across the board.")).toBeInTheDocument();
    expect(screen.getByText("Is this an OEM or aftermarket part?")).toBeInTheDocument();
    expect(screen.getByText("Was VAT included?")).toBeInTheDocument();
  });

  it("renders advice's explanation without a questions heading when there are no questions to ask", () => {
    render(
      <VerdictResult
        {...baseProps}
        communityStats={null}
        advice={{ explanation: "Nothing unusual here.", questionsToAsk: [] }}
      />
    );
    expect(screen.getByText("Nothing unusual here.")).toBeInTheDocument();
    expect(screen.queryByText("Worth asking the garage")).not.toBeInTheDocument();
  });

  it("formats the quoted price to a whole number regardless of decimal input", () => {
    render(<VerdictResult {...baseProps} quotedPrice={349.6} communityStats={null} advice={null} />);
    expect(screen.getByText(/You were quoted £350\./)).toBeInTheDocument();
  });
});
