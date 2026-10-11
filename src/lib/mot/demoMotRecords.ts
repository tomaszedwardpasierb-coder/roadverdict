// Place at: src/lib/mot/demoMotRecords.ts
//
// Made-up MOT histories for the demo account's two vehicles (the account
// store reviewers sign in to). The demo vehicles' plates are never looked
// up for real: a plate that belongs to a real vehicle would show a
// stranger's MOT record to anyone using the demo. Dates are relative to
// today, so the demo always looks current.
import type { MotRecord, MotTest } from "@/lib/mot/motRecord";
import { DEMO_MAKE, DEMO_MODEL, DEMO_REGISTRATION } from "@/lib/tracker/demoSeed";
import { DEMO_CAR_MAKE, DEMO_CAR_MODEL, DEMO_CAR_REGISTRATION } from "@/lib/tracker/demoCarSeed";

function monthsAgo(now: Date, months: number, day = 12): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, day, 10, 0, 0));
  return d.toISOString();
}

function plusYear(iso: string): string {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function test(date: string, passed: boolean, mileage: number, defects: MotTest["defects"] = []): MotTest {
  return { date, passed, mileage, expiryDate: passed ? plusYear(date) : null, defects };
}

const adv = (text: string) => ({ type: "ADVISORY" as const, text, dangerous: false });

export function demoBikeMotRecord(now = new Date()): MotRecord {
  const t0 = monthsAgo(now, 7, 13);
  const failDay = monthsAgo(now, 43, 5);
  // Newest first; the same-day retest (afternoon) comes before its fail.
  const tests: MotTest[] = [
    test(t0, true, 33882, [adv("Drive chain excessively slack"), adv("Rear tyre worn close to legal limit")]),
    test(monthsAgo(now, 19, 18), true, 30071, [adv("Front brake pad(s) wearing thin")]),
    test(monthsAgo(now, 31, 9), true, 24410),
    test(failDay.replace("T10:", "T14:"), true, 18233),
    test(failDay, false, 18233, [{ type: "MAJOR", text: "Headlamp aim too high", dangerous: false }]),
  ];
  return {
    registration: DEMO_REGISTRATION.replace(/\s+/g, ""),
    make: DEMO_MAKE.toUpperCase(),
    model: DEMO_MODEL.toUpperCase(),
    fuelType: "PETROL",
    colour: "BLUE",
    motDueDate: plusYear(t0),
    tests,
    kind: "bike",
    source: "vdg",
  };
}

export function demoCarMotRecord(now = new Date()): MotRecord {
  const t0 = monthsAgo(now, 5, 20);
  return {
    registration: DEMO_CAR_REGISTRATION.replace(/\s+/g, ""),
    make: DEMO_CAR_MAKE.toUpperCase(),
    model: DEMO_CAR_MODEL.toUpperCase(),
    fuelType: "PETROL",
    colour: "GREY",
    motDueDate: plusYear(t0),
    tests: [
      test(t0, true, 78214, [adv("Nearside front tyre worn close to legal limit"), adv("Front brake disc(s) slightly worn")]),
      test(monthsAgo(now, 17, 22), true, 70356, [adv("Offside rear tyre slightly damaged/cracking")]),
      test(monthsAgo(now, 29, 14), true, 61902),
      test(monthsAgo(now, 41, 11), true, 53120, [adv("Oil leak, but not excessive")]),
    ],
    kind: "car",
    source: "vdg",
  };
}
