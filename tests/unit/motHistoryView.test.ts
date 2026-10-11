// The app's MOT history screen data: status, score and each defect
// explained, worked out on the server from a MotRecord; and the demo
// account's made-up records.
import { describe, expect, it } from "vitest";
import { toMotHistoryView } from "@/lib/mot/motHistoryView";
import { demoBikeMotRecord, demoCarMotRecord } from "@/lib/mot/demoMotRecords";
import type { MotRecord } from "@/lib/mot/motRecord";

const NOW = new Date("2026-10-11T12:00:00Z");
const APP = "https://roadverdict.co.uk";

const record: MotRecord = {
  registration: "AB12CDE",
  make: "YAMAHA",
  model: "MT-07",
  fuelType: "PETROL",
  colour: "BLUE",
  motDueDate: "2027-03-12",
  kind: "bike",
  source: "vdg",
  tests: [
    {
      date: "2026-03-13T10:00:00",
      passed: true,
      mileage: 33882,
      expiryDate: "2027-03-12",
      defects: [
        { type: "ADVISORY", text: "Drive chain excessively slack", dangerous: false },
        { type: "ADVISORY", text: "Headlamp aim slightly high", dangerous: false },
      ],
    },
  ],
};

describe("toMotHistoryView", () => {
  it("says the MOT is valid, with the score and its band", () => {
    const v = toMotHistoryView(record, APP, NOW);
    expect(v.status).toEqual({ tone: "ok", text: "MOT valid until 12 March 2027" });
    expect(v.score).toMatchObject({ value: 96, band: "clean", label: "Clean record" });
    expect(v.tests[0]).toMatchObject({ dateLabel: "13 March 2026", passed: true, mileage: 33882 });
  });

  it("explains each defect, with an absolute link to the price guide only where we have prices", () => {
    const [chain, lamp] = toMotHistoryView(record, APP, NOW).tests[0].defects;
    expect(chain).toMatchObject({ severity: "advisory", severityLabel: "Advisory", categoryName: "Chain and sprockets" });
    expect(chain.explanation).toMatch(/drive chain and sprockets wear together/);
    expect(chain.cost?.line).toMatch(/^Typical cost: chain and sprockets £\d+-£\d+/);
    expect(chain.cost?.guideUrl).toBe("https://roadverdict.co.uk/motorcycles/costs/chain-and-sprockets");
    expect(lamp.categoryName).toBe("Lights");
    expect(lamp.cost).toBeNull();
  });

  it("says when an MOT has run out, and carries the DVSA licence line", () => {
    const v = toMotHistoryView({ ...record, motDueDate: "2026-01-01" }, APP, NOW);
    expect(v.status).toEqual({ tone: "bad", text: "MOT expired on 1 January 2026" });
    expect(v.disclaimer).toMatch(/Open Government Licence v3\.0/);
  });
});

describe("demo account MOT records", () => {
  it("are current, newest first, and never use a real lookup's source data", () => {
    for (const r of [demoBikeMotRecord(NOW), demoCarMotRecord(NOW)]) {
      const dates = r.tests.map((t) => new Date(t.date).getTime());
      expect(dates).toEqual([...dates].sort((a, b) => b - a));
      expect(new Date(r.motDueDate!).getTime()).toBeGreaterThan(NOW.getTime());
      expect(toMotHistoryView(r, APP, NOW).status.tone).toBe("ok");
    }
  });

  it("puts the bike's same-day retest before its fail", () => {
    const tests = demoBikeMotRecord(NOW).tests;
    const fail = tests.findIndex((t) => !t.passed);
    expect(tests[fail - 1].date.slice(0, 10)).toBe(tests[fail].date.slice(0, 10));
    expect(tests[fail - 1].passed).toBe(true);
  });
});
