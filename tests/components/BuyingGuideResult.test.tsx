// Place at: tests/components/BuyingGuideResult.test.tsx
//
// BuyingGuideForm.test.tsx already exercises this indirectly. This file
// pins the checklist/questions lists render from the real checklist
// object, and both states of the brand-notes section.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BuyingGuideResult } from "@/components/BuyingGuideResult";

const checklist = {
  emphasis: "Focus on the drivetrain.",
  inspectionPoints: ["Chain slack", "Sprocket wear"],
  questionsForSeller: ["Original owner?", "Any dropped gears reported?"],
};

describe("BuyingGuideResult", () => {
  it("renders every real inspection point and seller question", () => {
    render(
      <BuyingGuideResult
        checklist={checklist}
        addendum="Ask to see the last chain replacement date if known."
        brandNotes={null}
        ageBandLabel="Used"
        bikeClassLabel="Medium (401-750cc)"
        brandLabel="Kawasaki"
      />
    );
    expect(screen.getByText("Focus on the drivetrain.")).toBeInTheDocument();
    expect(screen.getByText("Chain slack")).toBeInTheDocument();
    expect(screen.getByText("Sprocket wear")).toBeInTheDocument();
    expect(screen.getByText("Original owner?")).toBeInTheDocument();
    expect(screen.getByText("Any dropped gears reported?")).toBeInTheDocument();
    expect(screen.getByText("Ask to see the last chain replacement date if known.")).toBeInTheDocument();
  });

  it("omits the brand-specific section and its caveat when there are no brand notes", () => {
    render(
      <BuyingGuideResult
        checklist={checklist}
        addendum="Nothing else to add."
        brandNotes={null}
        ageBandLabel="Used"
        bikeClassLabel="Medium (401-750cc)"
        brandLabel="Kawasaki"
      />
    );
    expect(screen.queryByText(/Specific to/)).not.toBeInTheDocument();
    expect(screen.queryByText(/owner-forum reports/)).not.toBeInTheDocument();
  });

  it("renders brand-specific notes with their own caveat when present", () => {
    render(
      <BuyingGuideResult
        checklist={checklist}
        addendum="Nothing else to add."
        brandNotes={["Known regulator/rectifier failures on early units."]}
        ageBandLabel="Used"
        bikeClassLabel="Medium (401-750cc)"
        brandLabel="Kawasaki"
      />
    );
    expect(screen.getByText("Specific to Kawasaki")).toBeInTheDocument();
    expect(screen.getByText("Known regulator/rectifier failures on early units.")).toBeInTheDocument();
    expect(screen.getByText(/owner-forum reports/)).toBeInTheDocument();
  });
});
