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

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildFactsBlock(input: VdiSummaryInput): string {
  const { vdiCheck } = input;
  const lines: string[] = [];
  lines.push(`VEHICLE: ${input.year ? `${input.year} ` : ""}${input.make} ${input.model}`);
  lines.push(`OWNER'S OWN DOCUMENTATION VERDICT: ${input.verdictLabel}`);
  lines.push("");

  lines.push("INDEPENDENT VDI CHECK (third-party, not self-reported):");
  lines.push(vdiCheck.isStolen ? "- STOLEN MARKER: yes, currently recorded as stolen" : "- Stolen marker: none");
  lines.push(
    vdiCheck.hasWriteOffRecord
      ? `- WRITE-OFF RECORD: yes, ${vdiCheck.writeOffRecordCount} record(s) on file`
      : "- Write-off record: none"
  );
  if (vdiCheck.hasOutstandingFinance) {
    const record = vdiCheck.financeRecords[0];
    lines.push(
      `- OUTSTANDING FINANCE: yes, ${vdiCheck.financeRecords.length} agreement(s) on file${record?.financeCompany ? ` (e.g. ${record.financeCompany}, ${record.agreementType ?? "type unknown"})` : ""}${record?.agreementDate ? `, agreement dated ${fmtDate(record.agreementDate)}` : ""}`
    );
  } else {
    lines.push("- Outstanding finance: none found");
  }
  lines.push(`- Keeper changes on independent record: ${vdiCheck.keeperChangeCount} (owner's own logged/DVLA figure: ${input.loggedKeeperChangeCount})`);
  if (vdiCheck.keeperChanges.length > 0) {
    lines.push("  Keeper change dates (most recent first):");
    for (const k of [...vdiCheck.keeperChanges].reverse()) {
      lines.push(`  - New keeper from ${fmtDate(k.keeperStartDate)}${k.previousKeeperDisposalDate ? ` (previous keeper's disposal recorded ${fmtDate(k.previousKeeperDisposalDate)})` : ""}`);
    }
  }
  lines.push(`- Plate changes on record: ${vdiCheck.plateChangeCount}`);
  lines.push(`- Colour changes on record: ${vdiCheck.colourChangeCount}`);
  lines.push(`- V5C logbook reissues on record: ${vdiCheck.v5cReissueCount}`);
  lines.push("");

  if (vdiCheck.calculatedAverageAnnualMileage != null && vdiCheck.averageMileageForAge != null) {
    lines.push("INDEPENDENT MILEAGE CHECK (DVSA-derived, separate from the owner's own logged mileage):");
    lines.push(`- Calculated average annual mileage for this vehicle: ${vdiCheck.calculatedAverageAnnualMileage.toLocaleString()} miles/year`);
    lines.push(`- Typical average annual mileage for a vehicle of this age: ${vdiCheck.averageMileageForAge.toLocaleString()} miles/year`);
    lines.push(`- Anomaly flagged: ${vdiCheck.mileageAnomalyDetected ? "yes" : "no"}`);
    lines.push("");
  }

  if (vdiCheck.manufacturerWarrantyMonths != null || vdiCheck.manufacturerWarrantyMiles != null) {
    lines.push(
      `MANUFACTURER WARRANTY: ${[
        vdiCheck.manufacturerWarrantyMonths ? `${vdiCheck.manufacturerWarrantyMonths} months` : null,
        vdiCheck.manufacturerWarrantyMiles ? `${vdiCheck.manufacturerWarrantyMiles.toLocaleString()} miles` : null,
      ]
        .filter(Boolean)
        .join(" / ")} from new, whichever comes first`
    );
    lines.push("");
  }

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
- A stolen marker or write-off record is the single most important thing here if present - lead with it.
- If outstanding finance is recorded and its agreement date sits at or after the current keeper's start date, say plainly that finance appears to be currently outstanding under this ownership, not just "on file historically" - this matters because it can mean the vehicle isn't legally the seller's to sell outright.
- If keeper change dates show multiple changes within a short span (say, under a year apart), name that specific pattern explicitly ("this vehicle changed hands twice within about X months") and suggest asking why - do not just report the count.
- If the independent keeper-change count and the owner's own logged figure disagree, say so plainly as a discrepancy worth asking about.
- If a calculated average annual mileage is given, compare it explicitly to the typical figure for this vehicle's age ("X miles/year vs Y typical for this age") rather than a vague "low mileage" comment - and note if an anomaly was flagged.
- If a manufacturer warranty window is given, mention whether the vehicle's age suggests it may still be within it, as a genuine buyer-relevant positive.
- If a valuation is given, compare the seller's own asking price (when given) against the valuation range factually - "this sits within/above/below the typical private-sale range" - never tell the buyer what to actually pay or whether it's a good deal.
- Do NOT tell the reader whether to buy the vehicle. Give them the independently-verified picture, not a purchase recommendation.
- Write like someone who actually looked at these specific facts and formed a view - never generic filler that could describe any vehicle.

Produce exactly three things:
1. "keyFindings": 1 to 6 short, specific findings from the VDI check, each traceable to a fact given below. If everything comes back clean, say so plainly as a genuine, positive finding ("no stolen marker, write-off record, or outstanding finance found") rather than an empty list.
2. "valuationNote": ONLY include this key when a valuation was given below - one short sentence factually comparing the asking price (if given) to the valuation range. Omit this key entirely when no valuation was given.
3. "summary": one short paragraph (2-4 sentences), the overall independently-verified picture.

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
