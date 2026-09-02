// Place at: src/lib/tracker/buyingGuideBriefing.ts
//
// Same division of labour as buyerOpinionProse.ts and storyProse.ts:
// every fact the model sees below is either this bike's own DVSA-verified
// MOT history or its basic identity - the model's job is connecting real
// advisories to what to check in person, plus general knowledge of the
// model itself, never inventing a fact about THIS specific bike that
// wasn't given to it. If this call fails or returns nothing usable, the
// caller simply omits the briefing - same as buyerOpinionProse, there's
// no deterministic fallback text for this, so nothing shows rather than
// something broken.

// Reverted to the exact model already proven live in production - see
// receiptParse.ts's GEMINI_MODEL comment for why the
// AI-Models-for-Different-Tasks.docx tier split broke on deploy.
const GEMINI_MODEL = "gemini-3.5-flash-lite";

export interface BuyingGuideBriefingInput {
  make: string;
  model: string;
  year: number;
  engineCapacityCc: number | null;
  // Oldest first - lets the model read the history as a timeline and
  // notice a pattern repeating across tests, not just the most recent one.
  motTests: {
    testDate: string;
    passed: boolean;
    mileage: number | null;
    notes: string;
  }[];
}

export interface BuyingGuideBriefingResult {
  motFlags: string[];
  modelNotes: string[];
  summary: string;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildFactsBlock(input: BuyingGuideBriefingInput): string {
  const lines: string[] = [];
  lines.push(`BIKE: ${input.year} ${input.make} ${input.model}`);
  if (input.engineCapacityCc) lines.push(`ENGINE: ${input.engineCapacityCc}cc`);
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

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an experienced motorcycle mechanic helping someone who is about to view and buy a specific used bike, before they've seen it in person. You know this exact model, and this exact bike's real DVSA MOT test history, given below.

Strict rules:
- Every MOT-related point must be traceable to a specific test or advisory given below - never invent a fact about THIS bike, never assume a fault exists unless it is actually recorded.
- General model knowledge (common faults, known issues, recalls) may draw on your own training knowledge of this make and model, since the facts below don't cover that - but be honest and specific, not generic filler that could apply to any bike ("check the tyres" is not useful; naming an actual known weak point for this model is).
- If an advisory or fail reason keeps reappearing across multiple tests without being fixed, say so plainly - that is a real pattern worth flagging clearly, not softening.
- Do not tell the reader whether to buy the bike. Give them specific things to check in person, not a purchase recommendation.
- Plain and direct, the way a mechanic actually talks to a mate - not a generic listicle, not hyped.

Produce exactly three things:
1. "motFlags": 0 to 4 short, specific things to check in person, each directly tied to something in this bike's real MOT history (an advisory, a fail reason, a pattern across tests). Empty array if the MOT history is clean or there is none at all - do not invent something to flag.
2. "modelNotes": 0 to 3 short, specific known issues or things worth checking for this exact make, model, and engine, drawn from your general knowledge of the model, not from the MOT data. Empty array if you genuinely don't have specific, reliable knowledge of common issues for this model - do not guess or generalise.
3. "summary": one short paragraph (2-3 sentences) pulling this together - the honest overall picture based on what is actually known, not a generic summary that could apply to any bike.

Return ONLY valid JSON matching this shape, nothing else, no markdown fences:
{"motFlags": ["...", "..."], "modelNotes": ["...", "..."], "summary": "..."}`;

export async function generateBuyingGuideBriefing(
  input: BuyingGuideBriefingInput,
  apiKey: string
): Promise<BuyingGuideBriefingResult | null> {
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
    if (!Array.isArray(parsed.motFlags) || !Array.isArray(parsed.modelNotes) || typeof parsed.summary !== "string") return null;

    return {
      motFlags: parsed.motFlags.filter((s: unknown): s is string => typeof s === "string"),
      modelNotes: parsed.modelNotes.filter((s: unknown): s is string => typeof s === "string"),
      summary: parsed.summary,
    };
  } catch {
    return null;
  }
}