// Place at: src/lib/tracker/carQuoteAdvice.ts
//
// Car equivalent of quoteAdvice.ts - same division of labour (every
// fact below was already computed deterministically by
// getAdjustedCarBenchmark/computeVerdict in /api/cars/verdict/route.ts,
// this file only explains those numbers, never recalculates them).
// Car quote-checker had no AI advice at all before this.
import { callGeminiForJson } from "./geminiJsonCall";

export interface CarQuoteAdviceInput {
  jobLabel: string;
  carClassLabel: string;
  brandLabel: string;
  brandTier: string;
  regionLabel: string;
  quotedPrice: number;
  range: { low: number; high: number };
  verdictLabel: string;
  sourceConfidence: string;
  sourceNote?: string;
  communityStats: { sampleSize: number; low: number; high: number } | null;
  // Only present when the driver used the registration lookup and it
  // returned real MOT history - oldest-first is handled internally.
  motTests?: { testDate: string; passed: boolean; notes: string }[];
}

export interface CarQuoteAdviceResult {
  explanation: string;
  questionsToAsk: string[];
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildFactsBlock(input: CarQuoteAdviceInput): string {
  const lines: string[] = [];
  lines.push(`JOB: ${input.jobLabel}`);
  lines.push(`CAR: ${input.carClassLabel}, ${input.brandLabel} (${input.brandTier} tier)`);
  lines.push(`REGION: ${input.regionLabel}`);
  lines.push("");
  lines.push(`QUOTED PRICE: £${input.quotedPrice.toFixed(0)}`);
  lines.push(`TYPICAL RANGE FOR THIS COMBINATION: £${input.range.low}-£${input.range.high}`);
  lines.push(`VERDICT: ${input.verdictLabel}`);
  lines.push(`BENCHMARK DATA CONFIDENCE: ${input.sourceConfidence}${input.sourceNote ? ` (${input.sourceNote})` : ""}`);
  lines.push("");
  if (input.communityStats) {
    lines.push(
      `COMMUNITY-REPORTED DATA (separate signal, not used to calculate the verdict above): ${input.communityStats.sampleSize} drivers reported £${input.communityStats.low}-£${input.communityStats.high} for this job recently.`
    );
  } else {
    lines.push("No community-reported data available for this job/car-size combination yet.");
  }

  if (input.motTests && input.motTests.length > 0) {
    lines.push("");
    lines.push("THIS CAR'S REAL MOT HISTORY (DVSA-verified, oldest to newest):");
    for (const t of [...input.motTests].reverse()) {
      const parts = [fmtDate(t.testDate), t.passed ? "Passed" : "Failed"];
      if (t.notes) parts.push(t.notes);
      lines.push(`- ${parts.join(" - ")}`);
    }
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an experienced car service advisor helping someone understand a quote they've received for their car, using only the facts given below.

Strict rules:
- Every claim must be traceable to a fact given below - never invent a reason for a price. Explain what the numbers show, not causes you are guessing at.
- If community-reported data is given, treat it as a separate, secondary signal from the benchmark range, not the same thing - they can legitimately disagree, and that is fine to note.
- Never just restate the verdict label back at them ("this is fair" on its own is not useful) - say specifically how the quoted price compares to the range, and by how much.
- If this car's real MOT history is given and an advisory plausibly relates to the quoted job (a brake advisory alongside brake work, a corrosion/structural advisory alongside suspension work), say so explicitly - that's a legitimate reason the price might run above a generic benchmark, not overcharging. If an advisory doesn't relate to the quoted job, don't force a connection.
- Do not tell them whether to accept the quote or go elsewhere. Give them the informed read and the right questions to ask, not the decision.
- If the benchmark data's confidence is "lower", say so plainly rather than presenting the range as more certain than it actually is.
- Write like someone who actually considered these specific facts, not a template - plain and direct, like a mechanic explaining this to a mate, not a corporate FAQ.

Produce exactly two things:
1. "explanation": 2 to 4 sentences on how this specific quote compares to what's typical for this job, this car size, this brand tier, and this region - and how confident that comparison actually is.
2. "questionsToAsk": 1 to 3 specific questions to ask the garage, grounded in what's actually driving the number (what's included, parts used, whether it's OEM) - not generic haggling advice.

Return ONLY valid JSON matching this shape, nothing else, no markdown fences:
{"explanation": "...", "questionsToAsk": ["...", "..."]}`;

function validate(parsed: unknown): CarQuoteAdviceResult | null {
  const p = parsed as { explanation?: unknown; questionsToAsk?: unknown };
  if (typeof p.explanation !== "string" || !Array.isArray(p.questionsToAsk)) return null;
  return {
    explanation: p.explanation,
    questionsToAsk: p.questionsToAsk.filter((s: unknown): s is string => typeof s === "string"),
  };
}

export async function generateCarQuoteAdvice(input: CarQuoteAdviceInput, apiKey: string): Promise<CarQuoteAdviceResult | null> {
  return callGeminiForJson(SYSTEM_PROMPT, buildFactsBlock(input), apiKey, validate, "carQuoteAdvice");
}
