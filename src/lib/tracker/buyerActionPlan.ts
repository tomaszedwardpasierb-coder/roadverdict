// Place at: src/lib/tracker/buyerActionPlan.ts
//
// A sequenced checklist tying together content already built elsewhere
// in the report, rather than introducing new advice from scratch - the
// specific questions live in "Questions worth asking the seller", the
// specific gaps live in "Walk-away risks", the specific MOT link lives
// in the verify block further down. This just gives a buyer an order
// to work through all of it in, with real counts from this bike's own
// report rather than generic boilerplate.

export interface ActionPlanStep {
  stage: string;
  detail: string;
}

export function buildBuyerActionPlan(questionCount: number, walkAwayIssueCount: number): ActionPlanStep[] {
  return [
    {
      stage: "Before contacting the seller",
      detail: "Read this report in full, including the full logged history and walk-away risks above.",
    },
    {
      stage: "Ask the seller",
      detail:
        questionCount > 0
          ? `Work through the ${questionCount} question${questionCount === 1 ? "" : "s"} above, under "Questions worth asking the seller".`
          : "No specific questions were generated from this record - ask generally about the bike's history and condition.",
    },
    {
      stage: "Verify independently",
      detail: "Cross-check the MOT history on GOV.UK directly, using the link below - never take a seller's word for it alone.",
    },
    {
      stage: "Inspect in person",
      detail: 'See the bike yourself, or bring someone qualified who can, before agreeing anything - see "Inspection-required risks" above for what this report specifically cannot tell you.',
    },
    {
      stage: "Decide after inspection",
      detail:
        walkAwayIssueCount > 0
          ? `This record has ${walkAwayIssueCount} potential walk-away issue${walkAwayIssueCount === 1 ? "" : "s"} flagged above - weigh those, plus whatever the inspection finds, before deciding.`
          : "Weigh what the inspection finds against everything in this report before deciding.",
    },
  ];
}