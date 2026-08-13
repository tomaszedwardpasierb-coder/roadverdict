// Place at: src/app/api/tracker/mot-history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBike, getCurrentRegistration } from "@/lib/tracker/bike";
import { createBill, getBills } from "@/lib/tracker/bill";
import { createReminder, deleteRemindersBySourceKey } from "@/lib/tracker/reminder";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
import { parseMotHistory, motReminderDate, type RawMotTest } from "@/lib/tracker/motHistory";

export const dynamic = "force-dynamic";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { bikeId } = body as { bikeId?: string };
  if (!bikeId) {
    return NextResponse.json({ error: "bikeId is required." }, { status: 400 });
  }

  const bike = await getBike(session.email, bikeId);
  if (!bike) {
    return NextResponse.json({ error: "Bike not found." }, { status: 404 });
  }

  const registration = getCurrentRegistration(bike);
  if (!registration) {
    return NextResponse.json(
      { error: "This bike has no registration on record, so it can't be looked up." },
      { status: 400 }
    );
  }

  const apiKey = process.env.VDG_API_KEY;
  if (!apiKey) {
    console.error("VDG_API_KEY is not configured.");
    return NextResponse.json({ error: "MOT lookup is not available right now." }, { status: 503 });
  }

  const url = `${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=MotHistoryDetails&vrm=${encodeURIComponent(registration)}`;

  let data: any;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (err) {
    console.error("VDG MOT history request failed:", err);
    return NextResponse.json({ error: "Couldn't reach the MOT lookup service." }, { status: 502 });
  }

  if (!data?.ResponseInformation?.IsSuccessStatusCode || !data?.Results?.MotHistoryDetails) {
    return NextResponse.json(
      { error: "No MOT history found - this bike may be MOT-exempt (under 3 years old) or not yet tested." },
      { status: 404 }
    );
  }

  const motData = data.Results.MotHistoryDetails;
  const parsed = parseMotHistory(motData.MotDueDate ?? null, (motData.MotTestDetailsList ?? []) as RawMotTest[]);

  // Matched on exact test date, so this is safe to re-run later (e.g. a
  // year on, to pull in the newest test) without creating duplicates for
  // tests already imported.
  const existingBills = await getBills(session.email, bike.id);
  const alreadyLoggedDates = new Set(
    existingBills.filter((b) => b.billType === "mot-test").map((b) => b.date.slice(0, 10))
  );

  const created: { date: string; passed: boolean }[] = [];
  const skipped: { date: string; reason: string }[] = [];

  for (const test of parsed.tests) {
    const day = test.testDate.slice(0, 10);
    if (alreadyLoggedDates.has(day)) {
      skipped.push({ date: day, reason: "Already logged." });
      continue;
    }
    if (isBeforeProduction(test.testDate, bike)) {
      skipped.push({ date: day, reason: "Before this bike's production year - skipped as implausible." });
      continue;
    }
    await createBill(session.email, {
      bikeId: bike.id,
      billType: "mot-test",
      cost: 0,
      date: test.testDate,
      notes: test.notes,
      mileage: test.mileage ?? undefined,
    });
    created.push({ date: day, passed: test.passed });
  }

  let reminderSet = false;
  if (parsed.motDueDate) {
    const sourceKey = "bill:mot-test";
    const latestTestDate = parsed.tests.length > 0 ? parsed.tests[parsed.tests.length - 1].testDate : new Date().toISOString();
    await deleteRemindersBySourceKey(session.email, bike.id, sourceKey);
    await createReminder(session.email, {
      bikeId: bike.id,
      name: "MOT renewal",
      intervalType: "date",
      exactDate: motReminderDate(parsed.motDueDate),
      date: latestTestDate,
      sourceKey,
    });
    reminderSet = true;
  }

  return NextResponse.json({
    createdCount: created.length,
    skippedCount: skipped.length,
    skipped,
    motDueDate: parsed.motDueDate,
    reminderSet,
  });
}
