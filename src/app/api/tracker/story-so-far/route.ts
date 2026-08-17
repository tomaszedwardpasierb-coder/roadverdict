// Place at: src/app/api/tracker/story-so-far/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike, updateBikeStoryCache } from "@/lib/tracker/bike";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getSellerReportCore } from "@/lib/tracker/sellerReportData";
import { computeBikeIdentity, computeCategorySpend, computeServiceRhythm, computeMpgTrend } from "@/lib/tracker/storyFacts";
import { generateStoryProse } from "@/lib/tracker/storyProse";

export const dynamic = "force-dynamic";

// One real (AI-costing) generation per week per bike - re-reading an
// already-generated story is free and instant; getting a genuinely
// fresh one before a week is up isn't available at any cost, by
// design, not just a soft warning.
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  // If a cached story exists and is still within its week, hand that
  // back verbatim - facts and prose generated together, at the same
  // moment, so they can't drift out of sync with each other the way
  // freshly-recomputed facts paired with week-old prose could. No
  // Gemini call happens on this path at all.
  if (bike.storyCache) {
    const generatedAt = new Date(bike.storyCache.generatedAt).getTime();
    const ageMs = Date.now() - generatedAt;
    if (ageMs < COOLDOWN_MS) {
      return NextResponse.json({
        ...bike.storyCache.response,
        cached: true,
        nextAvailableAt: new Date(generatedAt + COOLDOWN_MS).toISOString(),
      });
    }
  }

  // The same core computation the buyer report already relies on -
  // never a second, separately-derived version of the same facts.
  const core = await getSellerReportCore(session.email, bike.id);

  const [fuelLogs, records] = await Promise.all([
    getFuelLogs(session.email, bike.id),
    getServiceRecords(session.email, bike.id),
  ]);

  const identity = computeBikeIdentity(bike, core.rows.length + fuelLogs.length);
  const fuelTotal = fuelLogs.reduce((sum, f) => sum + f.cost, 0);
  const categorySpend = computeCategorySpend(core.rows, fuelTotal, fuelLogs.length);
  const serviceRhythm = computeServiceRhythm(records.map((r) => ({ date: r.date })));
  const mpgTrend = computeMpgTrend(fuelLogs);

  const proseInput = {
    identity,
    categorySpend,
    serviceRhythm,
    mpgTrend,
    verdict: core.verdict,
    unconfirmedFindings: core.unconfirmedFindings,
    upcomingReminders: core.upcomingReminders,
  };

  const apiKey = process.env.GEMINI_API_KEY;
  const prose = apiKey ? await generateStoryProse(proseInput, apiKey) : null;

  // Deterministic fallback when the LLM pass isn't available or fails -
  // the same underlying facts the buyer report already turns into
  // sentences, just reused directly rather than left blank. The
  // feature works either way; the LLM pass is polish on top, not a
  // dependency.
  const sharedStory = prose?.sharedStory ?? core.storyParagraphs;
  const ownerNotes = prose?.ownerNotes ?? core.unconfirmedFindings;

  const response = {
    generatedWithAi: prose !== null,
    sharedStory,
    ownerNotes,
    verdict: core.verdict,
    identity,
    categorySpend,
  };

  const generatedAt = new Date().toISOString();
  // Fire-and-forget-ish, but awaited: if this save fails, the person
  // still gets their story this once, they just won't get the free
  // cached re-read next time - worth not blocking a successful
  // response over, but still worth actually awaiting rather than
  // risking it never completing if the runtime tears down right after
  // this request finishes.
  await updateBikeStoryCache(session.email, bike.id, { generatedAt, response });

  return NextResponse.json({ ...response, cached: false, nextAvailableAt: new Date(Date.now() + COOLDOWN_MS).toISOString() });
}
