// Place at: src/app/api/cars/car-story-so-far/route.ts
// Car mirror of api/tracker/story-so-far/route.ts.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryCar, updateCarStoryCache } from "@/lib/tracker/car";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarSellerReportCore } from "@/lib/tracker/carSellerReportData";
import { computeCarIdentity } from "@/lib/tracker/carStoryFacts";
import { computeCategorySpend, computeServiceRhythm, computeMpgTrend } from "@/lib/tracker/storyFacts";
import { generateCarStoryProse } from "@/lib/tracker/carStoryProse";

export const dynamic = "force-dynamic";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const car = await getPrimaryCar(session.email);
  if (!car) {
    return NextResponse.json({ error: "No car found for this account." }, { status: 404 });
  }

  if (car.storyCache) {
    const generatedAtMs = new Date(car.storyCache.generatedAt).getTime();
    const ageMs = Date.now() - generatedAtMs;
    if (ageMs < COOLDOWN_MS) {
      return NextResponse.json({
        ...car.storyCache.response,
        generatedAt: car.storyCache.generatedAt,
        cached: true,
        nextAvailableAt: new Date(generatedAtMs + COOLDOWN_MS).toISOString(),
      });
    }
  }

  const core = await getCarSellerReportCore(session.email, car.id);

  const [fuelLogs, records] = await Promise.all([
    getCarFuelLogs(session.email, car.id),
    getCarServiceRecords(session.email, car.id),
  ]);

  const identity = computeCarIdentity(car, core.rows.length + fuelLogs.length);
  const fuelTotal = fuelLogs.reduce((sum, f) => sum + f.cost, 0);
  const categorySpend = computeCategorySpend(core.rows, fuelTotal, fuelLogs.length);
  const serviceRhythm = computeServiceRhythm(records.map((r) => ({ date: r.date })));
  // Electric-only fill-ups (no litres, kWh charging) are excluded here -
  // computeMpgTrend/computeMPGSeries reads a litres-based MPG calc, the
  // same reason dashboard/page.tsx's own mpgSeries filters them out for
  // the car dashboard's charts.
  const mpgTrend = computeMpgTrend(
    fuelLogs
      .filter((f): f is typeof f & { litres: number } => f.litres != null)
      .map((f) => ({ id: f.id, mileage: f.mileage, litres: f.litres, filledToFull: f.filledToFull ?? false, date: f.date, mileageConfidence: f.mileageConfidence, mileageAnomaly: f.mileageAnomaly }))
  );

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
  const prose = apiKey ? await generateCarStoryProse(proseInput, apiKey) : null;

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
  await updateCarStoryCache(session.email, car.id, { generatedAt, response });

  return NextResponse.json({ ...response, generatedAt, cached: false, nextAvailableAt: new Date(Date.now() + COOLDOWN_MS).toISOString() });
}
