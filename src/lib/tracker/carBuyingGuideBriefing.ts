// Place at: src/lib/tracker/carBuyingGuideBriefing.ts
//
// Car equivalent of buyingGuideBriefing.ts - same division of labour
// (every MOT-related point must trace to a real recorded test/advisory,
// general model knowledge may draw on training data, never a buy/don't-buy
// recommendation), car-flavored facts and system prompt instead of a
// find-and-replace of the bike wording: car-specific MOT categories
// (structural corrosion, emissions/exhaust, ABS/SRS warning lights) get
// their own explicit callout, and the fuel type given below drives
// whether EV/hybrid-specific due-diligence points (battery health,
// charging cable, battery warranty) belong in the answer at all - a
// petrol/diesel car gets none of that.
//
// Uses the newer systemInstruction field (like carBuyerOpinionProse.ts
// and carStoryProse.ts) rather than buyingGuideBriefing.ts's older
// concatenate-into-contents pattern - an intentional improvement on this
// newer file, not a change to the bike one.
import { logGeminiUsage } from "@/lib/tracker/geminiUsageLog";
import type { VdiCheckResult, ValuationResult } from "@/lib/tracker/vdiUnlock";
import type { VehicleTaxDetails } from "@/lib/tracker/vehicleTaxFetch";

const GEMINI_MODEL = "gemini-3.7-flash";

export interface CarBuyingGuideBriefingInput {
  make: string;
  model: string;
  fuelType: string;
  // Oldest first - lets the model read the history as a timeline and
  // notice a pattern repeating across tests, not just the most recent one.
  motTests: {
    testDate: string;
    passed: boolean;
    mileage: number | null;
    notes: string;
  }[];
  // Only present once the buyer has paid for the standalone VDI check
  // (see vdiPurchase.ts) and it's been fetched - absent for the plain,
  // free lookup.
  vdiCheck?: VdiCheckResult;
  // Free but rate-limited (see valuationCheckUsage.ts), fully decoupled
  // from vdiCheck's paid-purchase gate above - present whenever the
  // account was within its valuation allowance for this lookup.
  valuation?: ValuationResult;
  // Free, always attempted alongside MOT history - unlike vdiCheck/
  // valuation above, this isn't rate-limited or paid at all.
  taxDetails?: VehicleTaxDetails;
}

export interface CarBuyingGuideBriefingResult {
  motFlags: string[];
  modelNotes: string[];
  summary: string;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildFactsBlock(input: CarBuyingGuideBriefingInput): string {
  const lines: string[] = [];
  lines.push(`CAR: ${input.make} ${input.model}`);
  lines.push(`FUEL TYPE: ${input.fuelType}`);
  lines.push("");

  if (input.motTests.length > 0) {
    lines.push("MOT HISTORY (DVSA-verified, oldest to newest):");
    for (const t of input.motTests) {
      const parts = [fmtDate(t.testDate), t.passed ? "Passed" : "Failed"];
      if (t.mileage !== null) parts.push(`${t.mileage.toLocaleString()} miles`);
      if (t.notes) parts.push(t.notes);
      lines.push(`- ${parts.join(" - ")}`);
    }
  } else {
    lines.push("No MOT test history on record for this registration.");
  }

  if (input.vdiCheck) {
    lines.push("");
    lines.push("VDI CHECK (independent, third-party):");
    lines.push(input.vdiCheck.isStolen ? "- STOLEN MARKER: yes" : "- Stolen marker: none");
    lines.push(input.vdiCheck.hasWriteOffRecord ? `- WRITE-OFF RECORD: yes, ${input.vdiCheck.writeOffRecordCount} record(s)` : "- Write-off record: none");
    lines.push(input.vdiCheck.hasOutstandingFinance ? `- OUTSTANDING FINANCE: yes, ${input.vdiCheck.financeRecords.length} agreement(s)` : "- Outstanding finance: none found");
  }

  if (input.valuation?.privateAverage != null) {
    lines.push("");
    lines.push(`VALUATION (independent): private average £${input.valuation.privateAverage.toLocaleString()}`);
  }

  if (input.taxDetails) {
    lines.push("");
    lines.push(
      `TAX STATUS (DVLA-verified): ${input.taxDetails.taxStatus ?? "unknown"}${input.taxDetails.taxIsCurrentlyValid ? "" : " - NOT currently valid"}`
    );
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an experienced car mechanic helping someone who is about to view and buy a specific used car, before they've seen it in person. You know this exact model, and this exact car's real DVSA MOT test history, given below.

Strict rules:
- Every MOT-related point must be traceable to a specific test or advisory given below - never invent a fact about THIS car, never assume a fault exists unless it is actually recorded.
- Pay particular attention to structural corrosion (sills, subframes, floor pans), emissions/exhaust faults (including DPF/catalytic issues), and ABS/SRS/airbag warning-light faults where the MOT history actually records them - these categories matter more for a used car buyer than cosmetic wear.
- A DANGEROUS-flagged item in the history is the single most important thing to surface, whether or not it was later fixed - never bury it among minor points.
- General model knowledge (common faults, known issues, recalls) may draw on your own training knowledge of this make and model, since the facts below don't cover that - but be honest and specific, not generic filler that could apply to any car ("check the tyres" is not useful; naming an actual known weak point for this model is).
- If an advisory or fail reason keeps reappearing across multiple tests without being fixed, say so plainly - that is a real pattern worth flagging clearly, not softening.
- If the FUEL TYPE given below indicates this car is electric, hybrid, or plug-in hybrid, include specific due-diligence points for that in "modelNotes": battery state-of-health/degradation, whether a charging cable is included with the sale, and this manufacturer's battery warranty terms for this model. A petrol or diesel car needs none of this - only raise it when the fuel type actually calls for it.
- If a VDI CHECK block is given below, a stolen marker, write-off record, or outstanding finance is the single most important thing here - lead with it as the first motFlag, whether or not the MOT history itself shows anything.
- If a TAX STATUS fact is given below and shows the car is SORN or not currently valid, mention it plainly as something to resolve before the car can be used on the road - a practical logistics point, not a comment on condition.
- Do not tell the reader whether to buy the car. Give them specific things to check in person, not a purchase recommendation.
- Plain and direct, the way a mechanic actually talks to a mate - not a generic listicle, not hyped.

Produce exactly three things:
1. "motFlags": 0 to 4 short, specific things to check in person, each directly tied to something in this car's real MOT history (an advisory, a fail reason, a pattern across tests). Empty array if the MOT history is clean or there is none at all - do not invent something to flag.
2. "modelNotes": 0 to 4 short, specific known issues or things worth checking for this exact make, model, and fuel type, drawn from your general knowledge of the model (and, where the fuel type calls for it, the EV/hybrid due-diligence points above), not from the MOT data. Empty array if you genuinely don't have specific, reliable knowledge of common issues for this model - do not guess or generalise.
3. "summary": one short paragraph (2-3 sentences) pulling this together - the honest overall picture based on what is actually known, not a generic summary that could apply to any car.

Return ONLY valid JSON matching this shape, nothing else, no markdown fences:
{"motFlags": ["...", "..."], "modelNotes": ["...", "..."], "summary": "..."}`;

export async function generateCarBuyingGuideBriefing(
  input: CarBuyingGuideBriefingInput,
  apiKey: string
): Promise<CarBuyingGuideBriefingResult | null> {
  const factsBlock = buildFactsBlock(input);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: `FACTS:\n${factsBlock}` }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) {
      await logGeminiUsage("carBuyingGuideBriefing", GEMINI_MODEL, false);
      return null;
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      await logGeminiUsage("carBuyingGuideBriefing", GEMINI_MODEL, false);
      return null;
    }

    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed.motFlags) || !Array.isArray(parsed.modelNotes) || typeof parsed.summary !== "string") {
      await logGeminiUsage("carBuyingGuideBriefing", GEMINI_MODEL, false);
      return null;
    }

    await logGeminiUsage("carBuyingGuideBriefing", GEMINI_MODEL, true);
    return {
      motFlags: parsed.motFlags.filter((s: unknown): s is string => typeof s === "string"),
      modelNotes: parsed.modelNotes.filter((s: unknown): s is string => typeof s === "string"),
      summary: parsed.summary,
    };
  } catch {
    await logGeminiUsage("carBuyingGuideBriefing", GEMINI_MODEL, false);
    return null;
  }
}
