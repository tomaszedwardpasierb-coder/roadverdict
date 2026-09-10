// Place at: src/lib/tracker/quoteAdvice.ts
//
// Same division of labour as every other Gemini module in this app:
// every fact below was already computed by deterministic code
// (getAdjustedBenchmark, computeVerdict, getCommunityStats in
// /api/verdict/route.ts) - this file's only job is explaining those
// numbers, never recalculating or contradicting them. If this call
// fails or returns nothing usable, the caller omits the advice - the
// verdict stamp itself already works standalone, this is additive.

import { callGeminiForJson } from "./geminiJsonCall";

export interface QuoteAdviceInput {
  jobLabel: string;
  bikeClassLabel: string;
  brandLabel: string;
  brandTier: string;
  regionLabel: string;
  quotedPrice: number;
  range: { low: number; high: number };
  verdictLabel: string;
  sourceConfidence: string;
  sourceNote?: string;
  communityStats: { sampleSize: number; low: number; high: number } | null;
  // Only present when the rider used the registration lookup and it
  // returned real MOT history - oldest-first, same convention as every
  // other MOT-consuming AI module in this app.
  motTests?: { testDate: string; passed: boolean; notes: string }[];
}

export interface QuoteAdviceResult {
  explanation: string;
  questionsToAsk: string[];
}

function buildFactsBlock(input: QuoteAdviceInput): string {
  const lines: string[] = [];
  lines.push(`JOB: ${input.jobLabel}`);
  lines.push(`BIKE: ${input.bikeClassLabel}, ${input.brandLabel} (${input.brandTier} tier)`);
  lines.push(`REGION: ${input.regionLabel}`);
  lines.push("");
  lines.push(`QUOTED PRICE: £${input.quotedPrice.toFixed(0)}`);
  lines.push(`TYPICAL RANGE FOR THIS COMBINATION: £${input.range.low}-£${input.range.high}`);
  lines.push(`VERDICT: ${input.verdictLabel}`);
  lines.push(`BENCHMARK DATA CONFIDENCE: ${input.sourceConfidence}${input.sourceNote ? ` (${input.sourceNote})` : ""}`);
  lines.push("");
  if (input.communityStats) {
    lines.push(
      `COMMUNITY-REPORTED DATA (separate signal, not used to calculate the verdict above): ${input.communityStats.sampleSize} riders reported £${input.communityStats.low}-£${input.communityStats.high} for this job recently.`
    );
  } else {
    lines.push("No community-reported data available for this job/bike-size combination yet.");
  }

  if (input.motTests && input.motTests.length > 0) {
    lines.push("");
    lines.push("THIS BIKE'S REAL MOT HISTORY (DVSA-verified, oldest to newest):");
    // Reversed here (the caller passes newest-first, matching how it's
    // displayed) so the model reads it as a timeline, same convention
    // as every other MOT-consuming module in this app.
    for (const t of [...input.motTests].reverse()) {
      const parts = [fmtDate(t.testDate), t.passed ? "Passed" : "Failed"];
      if (t.notes) parts.push(t.notes);
      lines.push(`- ${parts.join(" - ")}`);
    }
  }

  return lines.join("\n");
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const SYSTEM_PROMPT = `You are an experienced motorcycle service advisor helping someone understand a quote they've received for their bike, using only the facts given below.

Strict rules:
- Every claim must be traceable to a fact given below - never invent a reason for a price (for example, do not claim labour rates are higher somewhere unless that is actually stated - it is not). Explain what the numbers show, not causes you are guessing at.
- If community-reported data is given, treat it as a separate, secondary signal from the benchmark range, not the same thing - they can legitimately disagree, and that is fine to note.
- Never just restate the verdict label back at them ("this is fair" on its own is not useful) - say specifically how the quoted price compares to the range, and by how much.
- If this bike's real MOT history is given and an advisory plausibly relates to the quoted job (a chain/sprocket advisory alongside a drivetrain service, a brake advisory alongside brake work), say so explicitly - that's a legitimate reason the price might run above a generic benchmark, not overcharging. If an advisory doesn't relate to the quoted job, don't force a connection.
- Do not tell them whether to accept the quote or go elsewhere. Give them the informed read and the right questions to ask, not the decision.
- If the benchmark data's confidence is "lower", say so plainly rather than presenting the range as more certain than it actually is.
- Write like someone who actually considered these specific facts, not a template - plain and direct, like a mechanic explaining this to a mate, not a corporate FAQ.

Produce exactly two things:
1. "explanation": 2 to 4 sentences on how this specific quote compares to what's typical for this job, this bike size, this brand tier, and this region - and how confident that comparison actually is.
2. "questionsToAsk": 1 to 3 specific questions to ask the garage, grounded in what's actually driving the number (what's included, parts used, whether it's OEM) - not generic haggling advice.

Return ONLY valid JSON matching this shape, nothing else, no markdown fences:
{"explanation": "...", "questionsToAsk": ["...", "..."]}`;

function validate(parsed: unknown): QuoteAdviceResult | null {
  const p = parsed as { explanation?: unknown; questionsToAsk?: unknown };
  if (typeof p.explanation !== "string" || !Array.isArray(p.questionsToAsk)) return null;
  return {
    explanation: p.explanation,
    questionsToAsk: p.questionsToAsk.filter((s: unknown): s is string => typeof s === "string"),
  };
}

export async function generateQuoteAdvice(input: QuoteAdviceInput, apiKey: string): Promise<QuoteAdviceResult | null> {
  return callGeminiForJson(SYSTEM_PROMPT, buildFactsBlock(input), apiKey, validate, "quoteAdvice");
}