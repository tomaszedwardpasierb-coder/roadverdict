import { describe, expect, it } from "vitest";
import { CAR_LABOUR_LABELS, CAR_LABOUR_GROUPS, CAR_LABOUR_LABEL_TO_KEY, findGroupForCarLabourCategory } from "@/lib/tracker/carLabourTypes";

describe("CAR_LABOUR_LABELS/CAR_LABOUR_GROUPS catalog integrity", () => {
  it("has no duplicate label text across different keys", () => {
    const labels = Object.values(CAR_LABOUR_LABELS);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const label of labels) {
      if (seen.has(label)) duplicates.push(label);
      seen.add(label);
    }
    expect(duplicates).toEqual([]);
  });

  it("every job key referenced by a group actually exists in CAR_LABOUR_LABELS", () => {
    const missing: string[] = [];
    for (const group of CAR_LABOUR_GROUPS) {
      for (const job of group.jobs) {
        if (!(job in CAR_LABOUR_LABELS)) missing.push(`${group.group} -> ${job}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every CAR_LABOUR_LABELS key appears in exactly one group", () => {
    const counts = new Map<string, number>();
    for (const group of CAR_LABOUR_GROUPS) {
      for (const job of group.jobs) {
        counts.set(job, (counts.get(job) ?? 0) + 1);
      }
    }
    const labelKeys = Object.keys(CAR_LABOUR_LABELS);
    const notPlacedExactlyOnce = labelKeys.filter((key) => counts.get(key) !== 1);
    expect(notPlacedExactlyOnce).toEqual([]);
    expect([...counts.keys()].filter((key) => !(key in CAR_LABOUR_LABELS))).toEqual([]);
  });

  it("CAR_LABOUR_LABEL_TO_KEY is a correct, complete reverse map of CAR_LABOUR_LABELS", () => {
    for (const [key, label] of Object.entries(CAR_LABOUR_LABELS)) {
      expect(CAR_LABOUR_LABEL_TO_KEY[label]).toBe(key);
    }
    expect(Object.keys(CAR_LABOUR_LABEL_TO_KEY).length).toBe(Object.keys(CAR_LABOUR_LABELS).length);
  });

  it("includes an 'Other' catch-all category with an 'other' key", () => {
    expect(CAR_LABOUR_LABELS.other).toBeDefined();
    expect(CAR_LABOUR_GROUPS.some((g) => g.jobs.includes("other"))).toBe(true);
  });

  // The two categories with no motorcycle equivalent, per the plan's
  // explicit "including electric" requirement.
  it("includes the two car-only categories with no bike equivalent: A/C and electric/hybrid drive", () => {
    const groupNames = CAR_LABOUR_GROUPS.map((g) => g.group);
    expect(groupNames).toContain("Air conditioning & climate control");
    expect(groupNames).toContain("Electric & hybrid drive");
  });
});

describe("findGroupForCarLabourCategory", () => {
  it("finds the real group a known category belongs to", () => {
    expect(findGroupForCarLabourCategory("hv-battery-health-check")).toBe(
      CAR_LABOUR_GROUPS.find((g) => g.jobs.includes("hv-battery-health-check"))?.group
    );
  });

  it("returns undefined for a genuinely unrecognised category, rather than guessing a group", () => {
    expect(findGroupForCarLabourCategory("not-a-real-category")).toBeUndefined();
  });
});
