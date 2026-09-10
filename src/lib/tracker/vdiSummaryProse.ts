// Place at: src/lib/tracker/vdiSummaryProse.ts
//
// AI narrative over the Independent Vehicle Check's own facts (VDICheck,
// and for cars ValuationDetails) - genuinely vehicle-neutral, unlike
// buyerOpinionProse.ts/carBuyerOpinionProse.ts (which stay bike/car
// mirrors, untouched by this feature): VDICheck's shape and the facts a
// summary would comment on don't differ by vehicle kind, so this is one
// shared module rather than a mirrored pair. Kept separate from
// buyerOpinionProse - that pair is cached on a rolling 7-day cooldown
// tied to the free page and shouldn't need to regenerate just because
// VDI was purchased later; this one is generated once, at first view
// after purchase, and cached forever on the share link's own vdiUnlock
// field.
import { logGeminiUsage } from "@/lib/tracker/geminiUsageLog";
import type { VdiCheckResult, ValuationResult, VdiSummaryResult } from "@/lib/tracker/vdiUnlock";

const GEMINI_MODEL = "gemini-3.7-flash";

export interface VdiSummaryInput {
  make: string;
  model: string;
  // null for a custom build with no manufacture year on record.
  year: number | null;
  vdiCheck: VdiCheckResult;
  // Car only - both present together, or neither.
  valuation?: ValuationResult;
  askingPrice?: number;
  // The report's own documentation verdict, for cross-referencing
  // against the independently-verified facts below.
  verdictLabel: string;
  loggedKeeperChangeCount: number;
}

function buildFactsBlock(input: VdiSummaryInput): string {
  const lines: string[] = [];
  lines.push(`VEHICLE: ${input.year ? `${input.year} ` : ""}${input.make} ${input.model}`);
  lines.push(`OWNER'S OWN DOCUMENTATION VERDICT: ${input.verdictLabel}`);
  lines.push("");

  lines.push("INDEPENDENT VDI CHECK (third-party, not self-reported):");
  lines.push(input.vdiCheck.isStolen ? "- STOLEN MARKER: yes, currently recorded as stolen" : "- Stolen marker: none");
  lines.push(
    input.vdiCheck.hasWriteOffRecord
      ? `- WRITE-OFF RECORD: yes, ${input.vdiCheck.writeOffRecordCount} record(s) on file`
      : "- Write-off record: none"
  );
  lines.push(
    input.vdiCheck.hasOutstandingFinance
      ? `- OUTSTANDING FINANCE: yes, ${input.vdiCheck.financeRecords.length} agreement(s) on file${
          input.vdiCheck.financeRecords[0]?.financeCompany ? ` (e.g. ${input.vdiCheck.financeRecords[0].financeCompany})` : ""
        }`
      : "- Outstanding finance: none found"
  );
  lines.push(
    `- Keeper changes on independent record: ${input.vdiCheck.keeperChangeCount} (owner's own logged/DVLA figure: ${input.loggedKeeperChangeCount})`
  );
  lines.push(`- Plate changes on record: ${input.vdiCheck.plateChangeCount}`);
  lines.push(`- Colour changes on record: ${input.vdiCheck.colourChangeCount}`);
  lines.push("");

  if (input.valuation) {
    lines.push("VALUATION (independent, not the seller's own estimate):");
    if (input.valuation.privateAverage != null) lines.push(`- Private average: £${input.valuation.privateAverage.toLocaleString()}`);
    if (input.valuation.privateClean != null) lines.push(`- Private clean: £${input.valuation.privateClean.toLocaleString()}`);
    if (input.valuation.dealerForecourt != null) lines.push(`- Dealer forecourt: £${input.valuation.dealerForecourt.toLocaleString()}`);
    if (input.valuation.partExchange != null) lines.push(`- Part-exchange: £${input.valuation.partExchange.toLocaleString()}`);
    if (input.askingPrice != null) lines.push(`- Seller's own asking price: £${input.askingPrice.toLocaleString()}`);
    lines.push("");
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an independent vehicle-history analyst giving a buyer the plain-English meaning of a third-party data check on a specific vehicle, alongside what its own seller already documented. Use ONLY the facts given below - never invent, estimate, or assume a fact not explicitly stated.

Strict rules:
- A stolen marker or a write-off record is the single most important thing here if present - lead with it, do not bury it among smaller points.
- Outstanding finance matters because it can mean the vehicle isn't legally the seller's to sell outright - flag it plainly if present, without speculating about why.
- If the independent keeper-change count and the owner's own logged figure disagree, say so plainly as a discrepancy worth asking about - do not assume which one is wrong.
- If a valuation is given, compare the seller's own asking price (when given) against the valuation range factually - "this sits within/above/below the typical private-sale range" - never tell the buyer what to actually pay or whether it's a good deal.
- Do NOT tell the reader whether to buy the vehicle. Give them the independently-verified picture, not a purchase recommendation.
- Plain and direct - a skeptical buyer should find this credible, not salesy.

Produce these things:
1. "keyFindings": 1 to 5 short, specific findings from the VDI check, each traceable to a fact given below. If everything comes back clean, say so plainly as a genuine, positive finding ("no stolen marker, write-off record, or outstanding finance found") rather than an empty list.
2. "valuationNote": ONLY include this key when a valuation was given below - one short sentence factually comparing the asking price (if given) to the valuation range. Omit this key entirely when no valuation was given.
3. "summary": one short paragraph (2-3 sentences), the overall independently-verified picture.

Return ONLY valid JSON matching this shape, nothing else, no markdown fences:
{"keyFindings": ["...", "..."], "valuationNote": "...", "summary": "..."}`;

export async function generateVdiSummary(input: VdiSummaryInput, apiKey: string): Promise<VdiSummaryResult | null> {
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
      await logGeminiUsage("vdiSummary", GEMINI_MODEL, false);
      return null;
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      await logGeminiUsage("vdiSummary", GEMINI_MODEL, false);
      return null;
    }

    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed.keyFindings) || typeof parsed.summary !== "string") {
      await logGeminiUsage("vdiSummary", GEMINI_MODEL, false);
      return null;
    }

    await logGeminiUsage("vdiSummary", GEMINI_MODEL, true);
    return {
      keyFindings: parsed.keyFindings.filter((s: unknown): s is string => typeof s === "string"),
      valuationNote: typeof parsed.valuationNote === "string" ? parsed.valuationNote : null,
      summary: parsed.summary,
    };
  } catch {
    await logGeminiUsage("vdiSummary", GEMINI_MODEL, false);
    return null;
  }
}
