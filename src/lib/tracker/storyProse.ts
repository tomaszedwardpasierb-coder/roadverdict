// Place at: src/lib/tracker/storyProse.ts
//
// Turns already-computed, already-verified facts into warm, readable
// prose - never asked to compute or infer a fact itself. Every number
// the model sees below was produced by deterministic code elsewhere in
// this app (sellerReportData.ts, storyFacts.ts); this file's only job
// is turning a fixed set of true statements into a story, the same
// division of labour receiptParse.ts already draws between "the model
// reads what's on the page" and "the app decides what that means."
// If this call fails or returns something unusable, the caller falls
// back to the plain, deterministic paragraphs - this layer is additive
// polish, never a dependency the feature can't work without.

import type { SellerReportCore } from "@/lib/tracker/sellerReportData";
import type { BikeIdentity, CategorySpend, ServiceRhythm, MpgTrend } from "@/lib/tracker/storyFacts";

const GEMINI_MODEL = "gemini-3.5-flash-lite";

export interface StoryProseInput {
  identity: BikeIdentity;
  categorySpend: CategorySpend[];
  serviceRhythm: ServiceRhythm;
  mpgTrend: MpgTrend;
  verdict: SellerReportCore["verdict"];
  unconfirmedFindings: string[];
  upcomingReminders: SellerReportCore["upcomingReminders"];
}

export interface StoryProseResult {
  sharedStory: string[];
  ownerNotes: string[];
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildFactsBlock(input: StoryProseInput): string {
  const { identity, categorySpend, serviceRhythm, mpgTrend, verdict, unconfirmedFindings, upcomingReminders } = input;
  const lines: string[] = [];

  lines.push(`BIKE: ${identity.year ?? ""} ${identity.make} ${identity.model}`.trim());
  lines.push(`CURRENT MILEAGE: ${identity.currentMileage.toLocaleString()} miles`);
  lines.push(`LOGGED SINCE: ${fmtDate(identity.loggedSinceDate)} (${identity.loggedSpanYears.toFixed(1)} years)`);
  lines.push(`TOTAL EVENTS LOGGED: ${identity.totalLoggedEvents}`);
  lines.push("");

  lines.push("SPEND BY CATEGORY (all-time, only categories with at least one entry):");
  for (const c of categorySpend) {
    if (c.count === 0) continue;
    lines.push(`- ${c.category}: £${c.total.toFixed(2)} across ${c.count} ${c.count === 1 ? "entry" : "entries"}`);
  }
  lines.push("");

  lines.push("SERVICE RHYTHM:");
  lines.push(`- ${serviceRhythm.serviceCount} service ${serviceRhythm.serviceCount === 1 ? "entry" : "entries"}`);
  if (serviceRhythm.averageGapDays !== null) {
    lines.push(`- Average gap between services: ${serviceRhythm.averageGapDays} days`);
  }
  if (serviceRhythm.longestGapDays !== null && serviceRhythm.longestGapStartDate && serviceRhythm.longestGapEndDate) {
    lines.push(`- Longest gap: ${serviceRhythm.longestGapDays} days (between ${fmtDate(serviceRhythm.longestGapStartDate)} and ${fmtDate(serviceRhythm.longestGapEndDate)})`);
  }
  lines.push("");

  lines.push("FUEL EFFICIENCY:");
  if (mpgTrend.hasEnoughData && mpgTrend.overallAverageMpg !== null && mpgTrend.recentAverageMpg !== null) {
    lines.push(`- Overall average: ${mpgTrend.overallAverageMpg.toFixed(1)} mpg`);
    lines.push(`- Recent average (last ${mpgTrend.recentSegmentCount} fill-ups): ${mpgTrend.recentAverageMpg.toFixed(1)} mpg`);
    if (mpgTrend.anomalyCount > 0) {
      lines.push(`- ${mpgTrend.anomalyCount} fill-up${mpgTrend.anomalyCount === 1 ? "" : "s"} excluded as a known anomaly, not counted above`);
    }
  } else {
    lines.push("- Not enough fuel history logged yet to calculate a reliable trend");
  }
  lines.push("");

  lines.push(`DOCUMENTATION VERDICT: ${verdict.label}`);
  lines.push("Reasons:");
  for (const r of verdict.reasons) lines.push(`- ${r}`);
  lines.push("");

  if (unconfirmedFindings.length > 0) {
    lines.push("WHAT WOULD STRENGTHEN THE RECORD (for the owner only - never shown to a buyer):");
    for (const f of unconfirmedFindings) lines.push(`- ${f}`);
    lines.push("");
  }

  if (upcomingReminders.length > 0) {
    lines.push("UPCOMING:");
    for (const r of upcomingReminders) {
      lines.push(`- ${r.reminder.name} - ${r.status === "overdue" ? "overdue" : "due soon"}`);
    }
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are writing a short, warm, plainly factual "story so far" about a motorcycle's documented maintenance history, using ONLY the facts given below. This may be read by both the bike's current owner and a future potential buyer, so it must be honest and even-handed, never a sales pitch.

Strict rules:
- Never invent, estimate, or assume any fact not explicitly given below - if something isn't in the facts, don't mention it.
- Never speculate about WHY a pattern exists (why a gap happened, why spending was high one year, why something wasn't logged) - state what happened, not why. That is a judgement about the person, which you must never make.
- Never make any claim about the owner's character, honesty, carefulness, or intentions.
- Reference specific numbers and dates from the facts, not vague generalities like "well maintained" without a fact backing it up.
- Warm and readable, not clinical, but never hyped, never salesy, never using words like "amazing" or "impressive" - a skeptical buyer should find this credible, not promotional.

Produce exactly two things:
1. "sharedStory": 4 to 6 short paragraphs (1-3 sentences each) suitable for BOTH the owner and a future buyer to read - covering the bike's shape, its service rhythm, where the money has gone, and its fuel-efficiency trend if there's enough data for one. Do not mention the documentation verdict's internal reasons list directly; you may reference the verdict label itself naturally.
2. "ownerNotes": 1 to 3 short, specific, actionable notes for the OWNER ONLY, based strictly on the "WHAT WOULD STRENGTHEN THE RECORD" facts if given - never generic maintenance advice unconnected to those specific facts. If no such facts were given, return an empty array.

Return ONLY valid JSON matching this shape, nothing else, no markdown fences:
{"sharedStory": ["...", "..."], "ownerNotes": ["...", "..."]}`;

export async function generateStoryProse(input: StoryProseInput, apiKey: string): Promise<StoryProseResult | null> {
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
    if (!Array.isArray(parsed.sharedStory) || !Array.isArray(parsed.ownerNotes)) return null;

    return {
      sharedStory: parsed.sharedStory.filter((s: unknown): s is string => typeof s === "string"),
      ownerNotes: parsed.ownerNotes.filter((s: unknown): s is string => typeof s === "string"),
    };
  } catch {
    return null;
  }
}
