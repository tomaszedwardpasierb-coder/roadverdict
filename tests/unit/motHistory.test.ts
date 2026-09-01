import { describe, expect, it } from "vitest";
import { parseMotHistory, motReminderDate, type RawMotTest } from "@/lib/tracker/motHistory";

// Minimal valid raw test — callers set only what the individual test cares about
function rawTest(overrides: Partial<RawMotTest> = {}): RawMotTest {
  return {
    TestDate: "2025-01-01T00:00:00.000Z",
    TestPassed: true,
    ExpiryDate: "2026-01-01",
    OdometerReading: "10000",
    OdometerUnit: "Miles",
    OdometerResultType: "READ",
    DaysOutOfMot: 0,
    IsRetest: false,
    AnnotationList: [],
    ...overrides,
  };
}

describe("parseMotHistory", () => {
  it("returns null motDueDate and empty tests for empty input", () => {
    const result = parseMotHistory(null, []);
    expect(result).toEqual({ motDueDate: null, tests: [] });
  });

  it("passes motDueDate through unchanged", () => {
    const result = parseMotHistory("2026-05-01", []);
    expect(result.motDueDate).toBe("2026-05-01");
  });

  it("handles a null rawTests argument gracefully (same as empty array)", () => {
    const result = parseMotHistory(null, null as any);
    expect(result.tests).toEqual([]);
  });

  // ── Mileage conversion ──────────────────────────────────────────────────

  it("keeps a READ miles reading as-is", () => {
    const result = parseMotHistory(null, [rawTest({ OdometerReading: "12345", OdometerUnit: "Miles" })]);
    expect(result.tests[0].mileage).toBe(12345);
    expect(result.tests[0].mileageTrusted).toBe(true);
  });

  it("converts a READ kilometre reading to miles and rounds", () => {
    const result = parseMotHistory(null, [
      rawTest({ OdometerReading: "20000", OdometerUnit: "Kilometres" }),
    ]);
    // 20000 * 0.621371 = 12427.42 → 12427
    expect(result.tests[0].mileage).toBe(12427);
    expect(result.tests[0].mileageTrusted).toBe(true);
  });

  it("recognises 'km' as a kilometre unit (case-insensitive)", () => {
    const result = parseMotHistory(null, [rawTest({ OdometerReading: "10000", OdometerUnit: "KM" })]);
    expect(result.tests[0].mileage).toBe(6214); // 10000 * 0.621371 rounded
  });

  it("sets mileage to null and mileageTrusted to false for an UN-READABLE reading", () => {
    const result = parseMotHistory(null, [
      rawTest({ OdometerReading: "0", OdometerResultType: "UN-READABLE" }),
    ]);
    expect(result.tests[0].mileage).toBeNull();
    expect(result.tests[0].mileageTrusted).toBe(false);
  });

  it("sets mileage to null for a zero odometer reading even when marked READ", () => {
    const result = parseMotHistory(null, [
      rawTest({ OdometerReading: "0", OdometerResultType: "READ" }),
    ]);
    expect(result.tests[0].mileage).toBeNull();
  });

  // ── Sorting ─────────────────────────────────────────────────────────────

  it("returns tests sorted oldest-to-newest regardless of input order", () => {
    const result = parseMotHistory(null, [
      rawTest({ TestDate: "2025-03-01T00:00:00.000Z", OdometerReading: "15000" }),
      rawTest({ TestDate: "2023-01-01T00:00:00.000Z", OdometerReading: "5000" }),
      rawTest({ TestDate: "2024-06-01T00:00:00.000Z", OdometerReading: "10000" }),
    ]);
    expect(result.tests[0].testDate).toBe("2023-01-01T00:00:00.000Z");
    expect(result.tests[1].testDate).toBe("2024-06-01T00:00:00.000Z");
    expect(result.tests[2].testDate).toBe("2025-03-01T00:00:00.000Z");
  });

  // ── Same-day retest deduplication ───────────────────────────────────────

  it("collapses a same-day fail-then-pass retest into one entry (the latest)", () => {
    const result = parseMotHistory(null, [
      rawTest({ TestDate: "2025-01-01T09:00:00.000Z", TestPassed: false, OdometerReading: "10000" }),
      rawTest({ TestDate: "2025-01-01T15:00:00.000Z", TestPassed: true, OdometerReading: "10000" }),
    ]);
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].passed).toBe(true);
  });

  it("keeps two tests on different days as two separate entries", () => {
    const result = parseMotHistory(null, [
      rawTest({ TestDate: "2024-01-01T00:00:00.000Z", OdometerReading: "8000" }),
      rawTest({ TestDate: "2025-01-01T00:00:00.000Z", OdometerReading: "12000" }),
    ]);
    expect(result.tests).toHaveLength(2);
  });

  // ── Notes content ────────────────────────────────────────────────────────

  it("includes 'Passed' or 'Failed' in the notes", () => {
    const passed = parseMotHistory(null, [rawTest({ TestPassed: true })]);
    expect(passed.tests[0].notes).toContain("Passed");

    const failed = parseMotHistory(null, [rawTest({ TestPassed: false })]);
    expect(failed.tests[0].notes).toContain("Failed");
  });

  it("includes annotation text in notes, marking dangerous ones", () => {
    const result = parseMotHistory(null, [
      rawTest({
        AnnotationList: [
          { Type: "ADVISORY", Text: "Tyre worn", IsDangerous: false },
          { Type: "FAIL", Text: "Brake failure", IsDangerous: true },
        ],
      }),
    ]);
    expect(result.tests[0].notes).toContain("ADVISORY: Tyre worn");
    expect(result.tests[0].notes).toContain("DANGEROUS: FAIL: Brake failure");
  });

  it("adds a note when the odometer result is not READ", () => {
    const result = parseMotHistory(null, [rawTest({ OdometerResultType: "UN-READABLE" })]);
    expect(result.tests[0].notes).toContain("not confirmed by DVSA");
  });

  // ── Internal mileage-sequence conflict detection (second pass) ───────────

  // A DVSA reading that's chronologically impossible against an earlier
  // confirmed reading gets its mileage nulled out and mileageTrusted set
  // false, even though DVSA itself marked it READ.
  it("nulls the mileage of a later reading that is lower than a confirmed earlier one", () => {
    const result = parseMotHistory(null, [
      rawTest({ TestDate: "2023-01-01T00:00:00.000Z", OdometerReading: "15000" }),
      rawTest({ TestDate: "2024-01-01T00:00:00.000Z", OdometerReading: "10000" }), // impossible
    ]);
    expect(result.tests[0].mileage).toBe(15000);
    expect(result.tests[1].mileage).toBeNull();
    expect(result.tests[1].mileageTrusted).toBe(false);
    expect(result.tests[1].notes).toContain("conflicts with another MOT test");
  });

  it("accepts a later reading that is higher than the earlier one", () => {
    const result = parseMotHistory(null, [
      rawTest({ TestDate: "2023-01-01T00:00:00.000Z", OdometerReading: "10000" }),
      rawTest({ TestDate: "2024-01-01T00:00:00.000Z", OdometerReading: "15000" }),
    ]);
    expect(result.tests[0].mileage).toBe(10000);
    expect(result.tests[1].mileage).toBe(15000);
  });

  it("preserves pass/fail and test date even when mileage is conflict-nulled", () => {
    const result = parseMotHistory(null, [
      rawTest({ TestDate: "2023-01-01T00:00:00.000Z", OdometerReading: "15000", TestPassed: true }),
      rawTest({ TestDate: "2024-01-01T00:00:00.000Z", OdometerReading: "10000", TestPassed: false }),
    ]);
    expect(result.tests[1].passed).toBe(false);
    expect(result.tests[1].testDate).toBe("2024-01-01T00:00:00.000Z");
  });

  it("only conflicts against the accepted (non-conflicting) sequence, not against already-nulled ones", () => {
    // r1=10000, r2=5000 (conflicts → nulled), r3=12000 (should be fine against r1=10000)
    const result = parseMotHistory(null, [
      rawTest({ TestDate: "2022-01-01T00:00:00.000Z", OdometerReading: "10000" }),
      rawTest({ TestDate: "2023-01-01T00:00:00.000Z", OdometerReading: "5000" }),  // conflicts with r1
      rawTest({ TestDate: "2024-01-01T00:00:00.000Z", OdometerReading: "12000" }), // fine against r1
    ]);
    expect(result.tests[0].mileage).toBe(10000);
    expect(result.tests[1].mileage).toBeNull();
    expect(result.tests[2].mileage).toBe(12000);
  });
});

describe("motReminderDate", () => {
  it("returns a date 30 days before the MOT due date", () => {
    expect(motReminderDate("2026-05-01")).toBe("2026-04-01");
  });

  it("handles month boundaries correctly", () => {
    expect(motReminderDate("2026-03-01")).toBe("2026-01-30");
  });

  it("handles leap years correctly", () => {
    // 2024 is a leap year; 30 days before March 1 = Jan 31
    expect(motReminderDate("2024-03-01")).toBe("2024-01-31");
  });
});
