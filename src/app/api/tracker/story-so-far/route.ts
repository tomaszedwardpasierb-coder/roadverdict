// Place at: src/app/api/tracker/story-so-far/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getSellerReportCore } from "@/lib/tracker/sellerReportData";
import { computeBikeIdentity, computeCategorySpend, computeServiceRhythm, computeMpgTrend } from "@/lib/tracker/storyFacts";
import { generateStoryProse } from "@/lib/tracker/storyProse";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
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

  return NextResponse.json({
    generatedWithAi: prose !== null,
    sharedStory,
    ownerNotes,
    verdict: core.verdict,
    identity,
    categorySpend,
  });
}
