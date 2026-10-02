// Place at: src/lib/tracker/comparisonSummary.ts
//
// The short AI-written summary on the garage comparison (website and
// Android app). Same division of labour as every other Gemini module
// here: every number is worked out below, from the same comparison
// entries the table shows - the model only puts them into words, so it
// can't invent or miscalculate a figure.
//
// Written only when the owner asks (a button, not on every visit), then
// kept per set of vehicles and reused for as long as the facts behind it
// are unchanged - logging anything new, or the months ticking over, makes
// a fresh one available.
import { createHash } from "crypto";
import { getContainer } from "@/lib/cosmos";
import { isPro } from "@/lib/subscriptions";
import { callGeminiForJson } from "@/lib/tracker/geminiJsonCall";
import { loadComparison } from "@/lib/tracker/comparisonEntries";
import { buildCostPerMileVerdict, pickWinnerId } from "@/lib/tracker/bikeComparisonVerdict";
import { formatCostPerDistanceUnit, periodLabel } from "@/lib/tracker/comparisonSections";
import { formatCurrency, type Currency, type ExchangeRates } from "@/lib/tracker/currency";
import { formatDistance, type DistanceUnit } from "@/lib/tracker/unitFormat";
import { getExchangeRates } from "@/lib/tracker/currencyRates";
import type { VehicleComparisonEntry } from "@/lib/tracker/vehicleComparison";
import type { ComparisonPeriod } from "@/lib/tracker/bikeComparisonPeriod";

export interface ComparisonSummary {
  summary: string;
  points: string[];
  generatedAt: string;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function buildComparisonFacts({
  entries,
  currency,
  rates,
  distanceUnit,
  period,
}: {
  entries: VehicleComparisonEntry[];
  currency: Currency;
  rates: ExchangeRates | null;
  distanceUnit: DistanceUnit;
  period: ComparisonPeriod | null;
}): string {
  const money = (gbp: number) => formatCurrency(gbp, currency, rates);
  const distance = (miles: number) => formatDistance(miles, distanceUnit);
  const hasPeriod = !!period && !!(period.from || period.to);
  const label = periodLabel(period);
  const lines: string[] = [];

  lines.push(`PERIOD: ${hasPeriod ? label : "each vehicle's whole time with this owner"}`);
  lines.push(`MONEY IN ${currency}, DISTANCES IN ${distanceUnit === "km" ? "KILOMETRES" : "MILES"}`);
  lines.push("");

  entries.forEach((e, i) => {
    const s = e.spend;
    const fixed = s.billsTotal;
    const running = s.fuelTotal + s.servicingTotal + s.labourTotal;
    lines.push(`VEHICLE ${i + 1}: ${e.name} (${e.kind === "bike" ? "motorcycle" : "car"}${e.year ? `, ${e.year}` : ""})`);
    lines.push(`- Distance done (${label}): ${distance(e.milesRidden)}`);
    lines.push(`- Owned for: ${e.monthsOwned} month${e.monthsOwned === 1 ? "" : "s"} (since ${fmtDate(e.ownedSince)})`);
    lines.push(`- Average distance per month: ${e.milesPerMonth == null ? "not enough data" : distance(e.milesPerMonth)}`);
    lines.push(`- Current odometer: ${distance(e.currentMileage)}`);
    lines.push(`- Cost per ${distanceUnit === "km" ? "km" : "mile"}: ${e.costPerMile == null ? "not enough data" : formatCostPerDistanceUnit(e.costPerMile, currency, rates, distanceUnit)}`);
    lines.push(`- Total spend: ${money(s.grandTotal)}`);
    lines.push(
      `- Spend by category: fuel ${money(s.fuelTotal)}, servicing & repairs ${money(s.servicingTotal)}, labour ${money(s.labourTotal)}, parts & accessories ${money(s.modsTotal)}, insurance/tax/MOT/finance ${money(s.billsTotal)}`
    );
    if (s.grandTotal > 0) {
      lines.push(`- Share of spend that is fixed bills (insurance/tax/MOT/finance - paid however little it's used): ${pct(fixed, s.grandTotal)}%`);
      lines.push(`- Share of spend that is running costs (fuel, servicing, labour): ${pct(running, s.grandTotal)}%`);
      lines.push(`- Share of spend on parts & accessories: ${pct(s.modsTotal, s.grandTotal)}%`);
    }
    if (e.milesRidden > 0 && fixed > 0) {
      lines.push(`- Fixed bills alone per ${distanceUnit === "km" ? "km" : "mile"}: ${formatCostPerDistanceUnit(fixed / e.milesRidden, currency, rates, distanceUnit)}`);
    }
    if (!hasPeriod && e.yearSpend != null) lines.push(`- Spend so far this year: ${money(e.yearSpend)}`);
    lines.push(`- Real fuel economy: ${e.actualMpg == null ? "not enough full-tank fill-ups logged" : `${e.actualMpg.toFixed(1)} mpg`}`);
    lines.push(`- Services logged: ${e.serviceCount}${e.lastServiceDate ? `, last on ${fmtDate(e.lastServiceDate)}` : ", none logged"}`);
    if (e.kind === "bike") {
      lines.push(`- Due soonest: ${e.nextDue ? `${e.nextDue.name} (${e.nextDue.status === "overdue" ? "OVERDUE" : "due soon"})` : "nothing due soon"}`);
    }
    lines.push(`- History with a receipt attached: ${e.documentationPct == null ? "not tracked for cars yet" : `${e.documentationPct}%`}`);
    lines.push("");
  });

  // The comparisons themselves, already worked out - the model never
  // divides or subtracts anything on its own.
  lines.push("ALREADY WORKED OUT ACROSS THE VEHICLES:");
  const verdict = buildCostPerMileVerdict(entries.map((e) => ({ bikeId: e.bikeId, name: e.name, costPerMile: e.costPerMile })));
  lines.push(`- Cost per mile headline: ${verdict ?? "no clear winner (not enough data, or too close to call)"}`);
  const name = (id: string | null) => entries.find((e) => e.bikeId === id)?.name ?? null;
  const mostUsed = pickWinnerId(entries.map((e) => ({ bikeId: e.bikeId, value: e.milesRidden })), "higher");
  const byUse = [...entries].sort((a, b) => b.milesRidden - a.milesRidden);
  const [top, bottom] = [byUse[0], byUse[byUse.length - 1]];
  if (mostUsed && bottom.milesRidden > 0) {
    lines.push(`- Most used: ${name(mostUsed)} - ${(top.milesRidden / bottom.milesRidden).toFixed(1)} times the distance of the least used, ${bottom.name}`);
  } else if (mostUsed) {
    lines.push(`- Most used: ${name(mostUsed)} (${bottom.name} has no distance logged)`);
  } else {
    lines.push("- Most used: no clear leader");
  }
  const bySpend = [...entries].sort((a, b) => b.spend.grandTotal - a.spend.grandTotal);
  lines.push(`- Most spent on overall: ${bySpend[0].spend.grandTotal > bySpend[1].spend.grandTotal ? `${bySpend[0].name} (${money(bySpend[0].spend.grandTotal)})` : "tied"}`);
  const mpgWinner = pickWinnerId(entries.map((e) => ({ bikeId: e.bikeId, value: e.actualMpg })), "higher");
  lines.push(`- Best real fuel economy: ${mpgWinner ? name(mpgWinner) : "can't say - not enough data on at least two vehicles"}`);
  const docsWinner = pickWinnerId(entries.map((e) => ({ bikeId: e.bikeId, value: e.documentationPct })), "higher");
  lines.push(`- Best documented: ${docsWinner ? name(docsWinner) : "can't say"}`);

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an experienced owner of both motorcycles and cars, looking at someone's own logged running costs for the vehicles they've chosen to compare, and telling them plainly what the numbers show.

Strict rules:
- Use only the facts given. Every number in what you write must appear in the facts exactly as given - never calculate, round differently, estimate or invent a figure.
- Write in plain UK English, warmly but directly, like a knowledgeable mate - not a report template, not marketing.
- Lead with which vehicle is cheaper to run per mile, if the facts say so. Then which one gets used most.
- Where it explains a real difference, point out WHY one costs more: a vehicle that's used little but carries fixed bills (insurance/tax/MOT/finance) looks expensive per mile because those bills are spread over few miles - use the fixed-bill shares given to say this only when they support it.
- Mention fuel economy, servicing, anything overdue or due soon, and how well documented each one is only when the facts give something worth saying.
- You may make one practical observation the facts support (e.g. what a rarely used vehicle costs to keep on the road). Never tell the owner to sell, buy or get rid of anything, never give financial advice, and never guess at insurance prices or anything not in the facts.
- Be honest about gaps: if a figure says "not enough data", say what's missing (e.g. full-tank fill-ups) rather than drawing a conclusion from it.
- Refer to vehicles by the names given.

Produce exactly two things:
1. "summary": 3 to 5 sentences - the overall picture.
2. "points": 0 to 3 short, specific extra observations not already in the summary - an empty array if there's nothing genuinely useful to add. No filler.

Return ONLY valid JSON matching this shape, nothing else, no markdown fences:
{"summary": "...", "points": ["...", "..."]}`;

function validate(parsed: unknown): { summary: string; points: string[] } | null {
  const p = parsed as { summary?: unknown; points?: unknown };
  if (typeof p?.summary !== "string" || !p.summary.trim() || !Array.isArray(p.points)) return null;
  return {
    summary: p.summary.trim(),
    points: p.points.filter((s: unknown): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim()).slice(0, 3),
  };
}

// One saved summary per account and set of vehicles (and date range).
type SummaryDoc = ComparisonSummary & { id: string; pk: string; type: "comparisonSummary"; factsHash: string; ttl: number };

const SUMMARY_TTL_SECONDS = 90 * 24 * 60 * 60;

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function summaryDocId(ids: string[], period: ComparisonPeriod | null): string {
  return `comparisonSummary::${sha(JSON.stringify([[...ids].sort(), period?.from ?? null, period?.to ?? null])).slice(0, 32)}`;
}

export type ComparisonSummaryResult =
  | { ok: true; summary: ComparisonSummary | null }
  | { ok: false; reason: "not_pro" | "invalid" | "failed" };

// generate: false only returns a saved summary that still matches the
// data (or none); generate: true writes one when there isn't.
export async function getComparisonSummary(
  email: string,
  requestedIds: string[],
  period: ComparisonPeriod | null,
  generate: boolean
): Promise<ComparisonSummaryResult> {
  if (!(await isPro(email))) return { ok: false, reason: "not_pro" };
  const loaded = await loadComparison(email, requestedIds, period ?? undefined);
  if (loaded.entries.length === 0) return { ok: false, reason: "invalid" };

  const rates = await getExchangeRates();
  const facts = buildComparisonFacts({ entries: loaded.entries, currency: loaded.currency, rates, distanceUnit: loaded.distanceUnit, period });
  const factsHash = sha(facts);
  const id = summaryDocId(loaded.ids, period);
  const container = getContainer();

  try {
    const { resource } = await container.item(id, email).read<SummaryDoc>();
    if (resource && resource.factsHash === factsHash) {
      return { ok: true, summary: { summary: resource.summary, points: resource.points, generatedAt: resource.generatedAt } };
    }
  } catch {
    // Not saved yet (or unreadable) - treated as no summary.
  }
  if (!generate) return { ok: true, summary: null };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: "failed" };
  const written = await callGeminiForJson(SYSTEM_PROMPT, facts, apiKey, validate, "comparisonSummary");
  if (!written) return { ok: false, reason: "failed" };

  const summary: ComparisonSummary = { ...written, generatedAt: new Date().toISOString() };
  const doc: SummaryDoc = { id, pk: email, type: "comparisonSummary", factsHash, ttl: SUMMARY_TTL_SECONDS, ...summary };
  await container.items.upsert(doc).catch((err) => console.error("Saving a comparison summary failed:", err));
  return { ok: true, summary };
}
