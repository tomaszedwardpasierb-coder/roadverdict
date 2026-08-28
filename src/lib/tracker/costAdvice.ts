// Place at: src/lib/tracker/costAdvice.ts
//
// Same division of labour as quoteAdvice.ts and every other Gemini
// module in this app: the breakdown below was already computed by
// computeAnnualCost() - this file explains it, never recalculates it.
//
// One thing this file deliberately protects: CostBreakdownResult.tsx
// already excludes insurance on purpose, with real reasoning shown to
// the user (it depends on the rider - age, licence, no-claims, postcode
// - far more than the bike, so a generic estimate would mislead more
// than help). The system prompt below explicitly tells the model not to
// speculate about insurance, so this addition can't quietly contradict
// a decision already made and explained elsewhere on the same page.

import { callGeminiForJson } from "./geminiJsonCall";
import type { AnnualCostBreakdown } from "../costCalculator";

export interface CostAdviceInput {
  bikeClassLabel: string;
  brandLabel: string;
  regionLabel: string;
  annualMileage: number;
  breakdown: AnnualCostBreakdown;
}

export interface CostAdviceResult {
  explanation: string;
  watchOutFor: string[];
}

function buildFactsBlock(input: CostAdviceInput): string {
  const { breakdown } = input;
  const lines: string[] = [];
  lines.push(`BIKE: ${input.bikeClassLabel}, ${input.brandLabel}`);
  lines.push(`REGION: ${input.regionLabel}`);
  lines.push(`ANNUAL MILEAGE: ${input.annualMileage.toLocaleString()} miles`);
  lines.push("");
  lines.push("ANNUAL COST BREAKDOWN (already calculated, do not recompute):");
  lines.push(`- Servicing: £${breakdown.servicing} (sourced benchmark data)`);
  lines.push(`- Tyres: £${breakdown.tyres} (roughest figure here - assumes a flat mileage-based tyre lifespan, which varies a lot with riding style)`);
  lines.push(`- MOT: £${breakdown.mot} (sourced - real average market rate)`);
  lines.push(`- Road tax (VED): £${breakdown.tax} (sourced - official DVLA rate for this engine size band)`);
  lines.push(`- Fuel: £${breakdown.fuel} (sourced - current UK average petrol price, updated weekly)`);
  lines.push(`- Total: £${breakdown.total}`);
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an experienced motorcycle owner and mechanic helping someone understand their estimated annual running costs, using only the breakdown given below.

Strict rules:
- The numbers given are already computed - never recalculate them, never contradict them, only explain and contextualise them.
- This breakdown does NOT include insurance. That is deliberate, already explained to the reader elsewhere on this same page: insurance depends on the rider (age, licence, no-claims, postcode) far more than the bike, so a generic estimate would mislead more than help. Do not speculate about insurance costs, and do not list it as something to watch out for - it is explicitly out of scope here, not an oversight.
- This breakdown also does not include finance costs or unplanned repairs beyond routine servicing - if you mention either, be clear that's general knowledge about owning a bike, not something calculated from the numbers above.
- Do not tell the reader whether this bike is affordable for them. Give them the picture, not the decision.
- Plain and direct, like someone who actually owns and maintains bikes explaining it to a mate, not a corporate FAQ.

Produce exactly two things:
1. "explanation": 2 to 3 sentences on where the money in this specific breakdown actually goes - which line item is the largest share, and why that makes sense (or doesn't) for this size and class of bike at this mileage.
2. "watchOutFor": 0 to 3 short, specific, honest points about total cost of ownership for this class of bike that are not already in the breakdown - empty array if you don't have anything specific and genuinely useful to add. Do not pad with generic filler, and never mention insurance here.

Return ONLY valid JSON matching this shape, nothing else, no markdown fences:
{"explanation": "...", "watchOutFor": ["...", "..."]}`;

function validate(parsed: unknown): CostAdviceResult | null {
  const p = parsed as { explanation?: unknown; watchOutFor?: unknown };
  if (typeof p.explanation !== "string" || !Array.isArray(p.watchOutFor)) return null;
  return {
    explanation: p.explanation,
    watchOutFor: p.watchOutFor.filter((s: unknown): s is string => typeof s === "string"),
  };
}

export async function generateCostAdvice(input: CostAdviceInput, apiKey: string): Promise<CostAdviceResult | null> {
  return callGeminiForJson(SYSTEM_PROMPT, buildFactsBlock(input), apiKey, validate);
}