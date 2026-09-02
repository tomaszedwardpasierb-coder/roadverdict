// Place at: src/lib/tracker/buyerOpinionProse.ts
//
// Same division of labour as storyProse.ts: every fact the model sees
// below was computed by deterministic code elsewhere (sellerReportData.ts,
// the DVLA/MOT fetches in detailed/page.tsx) - this file's only
// job is turning those facts into an opinion, never inventing one of its
// own. But this is a genuinely different document from Story So Far, not
// just a bigger version of it: this is read by a stranger who might spend
// real money based on it, not the owner reading their own reference. That
// difference matters for exactly what kind of opinion is appropriate -
// see SYSTEM_PROMPT below for where the line sits between "an informed
// read on the record" (in scope) and "a purchase recommendation" (not).
// If this call fails or returns nothing usable, the caller simply omits
// this section - unlike Story So Far there's no deterministic fallback
// text for an opinion, so nothing shows rather than something broken.

// The most trust-sensitive AI output in the app - a stranger may spend
// real money partly on the strength of this opinion - so it gets the
// strongest model available, not the routing/extraction default. See
// AI-Models-for-Different-Tasks.docx.
const GEMINI_MODEL = "gemini-2.5-pro";

export interface BuyerOpinionInput {
  make: string;
  model: string;
  year?: number;
  isCustomBuild: boolean;
  engineCC: number;
  currentMileage: number;
  verdictLabel: string;
  verdictReasons: string[];
  totalSpend: number;
  totalEntries: number;
  receiptCount: number;
  backdatedCount: number;
  realTimeCount: number;
  // DVLA-verified, independent of anything the owner entered - a
  // scrapped/exported/unscrapped flag here is the single highest-signal
  // fact available, worth the model treating it as such.
  dvlaScrapped: boolean;
  dvlaExported: boolean;
  dvlaUnscrapped: boolean;
  warrantyStatus: "likely still within warranty" | "likely outside warranty" | null;
  motTestCount: number;
  motFailCount: number;
  motDueDate: string | null;
  keeperChangeCount: number;
  upcomingOverdueCount: number;
  upcomingDueSoonCount: number;
}

export interface BuyerOpinionResult {
  strengths: string[];
  concerns: string[];
  honestRead: string;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildFactsBlock(input: BuyerOpinionInput): string {
  const lines: string[] = [];

  lines.push(`BIKE: ${input.isCustomBuild ? "Custom build" : input.year ?? ""} ${input.make} ${input.model}`.trim());
  lines.push(`ENGINE: ${input.engineCC}cc`);
  lines.push(`CURRENT MILEAGE: ${input.currentMileage.toLocaleString()} miles`);
  lines.push("");

  lines.push(`DOCUMENTATION VERDICT: ${input.verdictLabel}`);
  lines.push("Reasons:");
  for (const r of input.verdictReasons) lines.push(`- ${r}`);
  lines.push("");

  lines.push("LOGGED HISTORY:");
  lines.push(`- ${input.totalEntries} total entries, £${input.totalSpend.toFixed(2)} spent`);
  lines.push(`- ${input.receiptCount} of ${input.totalEntries} entries have a receipt attached`);
  lines.push(`- ${input.realTimeCount} entries logged in real time, ${input.backdatedCount} entered after the fact`);
  lines.push("");

  lines.push("DVLA-VERIFIED STATUS (independent of anything the owner logged):");
  lines.push(input.dvlaScrapped ? "- Recorded as SCRAPPED" : "- Not recorded as scrapped");
  lines.push(input.dvlaExported ? "- Recorded as EXPORTED" : "- Not recorded as exported");
  if (input.dvlaUnscrapped) lines.push("- Previously recorded as scrapped, later un-scrapped");
  if (input.warrantyStatus) lines.push(`- Manufacturer warranty: ${input.warrantyStatus}`);
  lines.push(`- ${input.keeperChangeCount} keeper change${input.keeperChangeCount === 1 ? "" : "s"} on DVLA record`);
  lines.push("");

  if (input.motTestCount > 0) {
    lines.push("MOT HISTORY (DVSA-verified):");
    lines.push(`- ${input.motTestCount} test${input.motTestCount === 1 ? "" : "s"} on record, ${input.motFailCount} fail${input.motFailCount === 1 ? "" : "s"}`);
    if (input.motDueDate) lines.push(`- Next MOT due ${fmtDate(input.motDueDate)}`);
    lines.push("");
  }

  if (input.upcomingOverdueCount > 0 || input.upcomingDueSoonCount > 0) {
    lines.push("UPCOMING MAINTENANCE A NEW OWNER WOULD INHERIT:");
    if (input.upcomingOverdueCount > 0) lines.push(`- ${input.upcomingOverdueCount} item${input.upcomingOverdueCount === 1 ? "" : "s"} currently overdue`);
    if (input.upcomingDueSoonCount > 0) lines.push(`- ${input.upcomingDueSoonCount} item${input.upcomingDueSoonCount === 1 ? "" : "s"} due soon`);
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an experienced motorcycle dealer with a mechanic's background, giving an honest, informed read on a bike's documented history to someone who's considering buying it. Use ONLY the facts given below - never invent, estimate, or assume a fact not explicitly stated.

You're not inspecting the bike yourself - you're reading its paperwork, the same way a good dealer reads a service history before a bike even arrives on the forecourt. That has a real limit: this tells you what the RECORD shows, not what a hands-on inspection would find. Be genuinely opinionated about what the record itself suggests, while staying honest about that limit.

Strict rules:
- Every claim must be clearly traceable to a specific fact given below - an opinion built on a real fact is fine; an opinion built on nothing is not.
- Give a real, distinguishable assessment - not hedged into meaninglessness, not every bike sounding the same. If the record is genuinely strong, say so plainly. If there's a real gap or a DVLA flag worth taking seriously, say that plainly too.
- A DVLA scrapped, exported, or unscrapped flag is the single most important fact here if present - lead with it, don't bury it among smaller points.
- Do NOT tell the reader whether to buy the bike or make an explicit purchase recommendation ("buy this" / "avoid this" / "this is a good deal"). Give them the informed read a dealer would give a mate before they decide for themselves - not the decision itself.
- Never make any claim about the owner as a person - their honesty, character, or intentions. Stay with what the record and the DVLA/MOT data show about the machine, not a judgement of who's selling it.
- Plain and direct, the way a dealer actually talks to someone they're not trying to sell to - not hyped, not salesy, no words like "amazing" or "fantastic". A skeptical buyer should find this credible.

Produce exactly three things:
1. "strengths": 1 to 4 short, specific points genuinely in this bike's favour, each tied to a fact given. Empty array if there's honestly nothing notable to point to.
2. "concerns": 1 to 4 short, specific points worth being cautious about or asking the seller about, each tied to a fact given. Empty array if there's honestly nothing notable to flag.
3. "honestRead": one short paragraph (2-4 sentences), the overall dealer's read - direct and genuinely opinionated about what this specific record suggests, not a generic summary that could apply to any bike.

Return ONLY valid JSON matching this shape, nothing else, no markdown fences:
{"strengths": ["...", "..."], "concerns": ["...", "..."], "honestRead": "..."}`;

export async function generateBuyerOpinion(input: BuyerOpinionInput, apiKey: string): Promise<BuyerOpinionResult | null> {
  const factsBlock = buildFactsBlock(input);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nFACTS:\n${factsBlock}` }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed.strengths) || !Array.isArray(parsed.concerns) || typeof parsed.honestRead !== "string") return null;

    return {
      strengths: parsed.strengths.filter((s: unknown): s is string => typeof s === "string"),
      concerns: parsed.concerns.filter((s: unknown): s is string => typeof s === "string"),
      honestRead: parsed.honestRead,
    };
  } catch {
    return null;
  }
}
