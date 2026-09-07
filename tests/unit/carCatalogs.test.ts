import { describe, expect, it } from "vitest";
import { CAR_JOB_LABELS, CAR_JOB_REMINDER_DEFAULTS, CAR_BENCHMARKED_JOB_TYPES } from "@/lib/tracker/carJobTypes";
import { CAR_MOD_LABELS } from "@/lib/tracker/carModTypes";
import { CAR_BILL_LABELS, CAR_ONLY_BILL_LABELS } from "@/lib/tracker/carBillTypes";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { MOD_LABELS } from "@/lib/tracker/modTypes";
import { BILL_LABELS } from "@/lib/tracker/billTypes";

describe("CAR_JOB_LABELS", () => {
  it("has a safe universal 'other' fallback, same role as the motorcycle catalog's own", () => {
    expect(CAR_JOB_LABELS["other"]).toBeDefined();
  });

  it("every key in CAR_JOB_REMINDER_DEFAULTS exists in CAR_JOB_LABELS", () => {
    for (const key of Object.keys(CAR_JOB_REMINDER_DEFAULTS)) {
      expect(CAR_JOB_LABELS[key]).toBeDefined();
    }
  });

  it("every key in CAR_BENCHMARKED_JOB_TYPES exists in CAR_JOB_LABELS", () => {
    for (const key of CAR_BENCHMARKED_JOB_TYPES) {
      expect(CAR_JOB_LABELS[key]).toBeDefined();
    }
  });

  // Populated once Phase 7's price research landed - see carPriceData.ts's
  // CAR_BENCHMARKS for the sourced figures behind each of these 5.
  it("CAR_BENCHMARKED_JOB_TYPES lists exactly the 5 job types with a real, sourced benchmark", () => {
    expect(CAR_BENCHMARKED_JOB_TYPES.sort()).toEqual(
      ["oil-filter", "interim-service", "full-service", "brake-pads-front", "tyres-front-pair"].sort()
    );
  });
});

describe("catalog independence from the motorcycle equivalents", () => {
  // Not "no overlap at all" - a few real-world terms (e.g. "other") are
  // legitimately shared - but the two catalogs must be genuinely
  // separate objects a car-active session could never accidentally read
  // from the motorcycle one, or vice versa.
  it("CAR_JOB_LABELS and JOB_LABELS are different objects", () => {
    expect(CAR_JOB_LABELS).not.toBe(JOB_LABELS as unknown as typeof CAR_JOB_LABELS);
  });

  it("CAR_MOD_LABELS and MOD_LABELS are different objects, and the car catalog is deliberately far shorter", () => {
    expect(CAR_MOD_LABELS).not.toBe(MOD_LABELS as unknown as typeof CAR_MOD_LABELS);
    expect(Object.keys(CAR_MOD_LABELS).length).toBeLessThan(Object.keys(MOD_LABELS).length);
  });

  it("CAR_MOD_LABELS has its own safe 'other-accessory' fallback, matching the motorcycle catalog's key name", () => {
    expect(CAR_MOD_LABELS["other-accessory"]).toBeDefined();
  });
});

describe("CAR_BILL_LABELS", () => {
  it("includes every key from the shared BILL_LABELS import, not a re-declared copy", () => {
    for (const key of Object.keys(BILL_LABELS)) {
      expect(CAR_BILL_LABELS[key]).toBe(BILL_LABELS[key]);
    }
  });

  it("adds the car-only bill types on top (ULEZ/CAZ, Congestion) with no motorcycle equivalent", () => {
    for (const key of Object.keys(CAR_ONLY_BILL_LABELS)) {
      expect(CAR_BILL_LABELS[key]).toBe(CAR_ONLY_BILL_LABELS[key]);
      expect(BILL_LABELS[key]).toBeUndefined();
    }
  });

  it("does not modify the original BILL_LABELS export", () => {
    expect(Object.keys(BILL_LABELS)).toEqual(["insurance", "road-tax", "mot-test", "finance"]);
  });
});
