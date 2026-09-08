import { describe, expect, it } from "vitest";
import { LABOUR_LABELS, LABOUR_GROUPS, LABOUR_LABEL_TO_KEY, findGroupForLabourCategory } from "@/lib/tracker/labourTypes";

describe("LABOUR_LABELS/LABOUR_GROUPS catalog integrity", () => {
  it("has no duplicate label text across different keys", () => {
    const labels = Object.values(LABOUR_LABELS);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const label of labels) {
      if (seen.has(label)) duplicates.push(label);
      seen.add(label);
    }
    expect(duplicates).toEqual([]);
  });

  it("every job key referenced by a group actually exists in LABOUR_LABELS", () => {
    const missing: string[] = [];
    for (const group of LABOUR_GROUPS) {
      for (const job of group.jobs) {
        if (!(job in LABOUR_LABELS)) missing.push(`${group.group} -> ${job}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every LABOUR_LABELS key appears in exactly one group", () => {
    const counts = new Map<string, number>();
    for (const group of LABOUR_GROUPS) {
      for (const job of group.jobs) {
        counts.set(job, (counts.get(job) ?? 0) + 1);
      }
    }
    const labelKeys = Object.keys(LABOUR_LABELS);
    const notPlacedExactlyOnce = labelKeys.filter((key) => counts.get(key) !== 1);
    expect(notPlacedExactlyOnce).toEqual([]);
    // And nothing in a group that isn't a real label key either.
    expect([...counts.keys()].filter((key) => !(key in LABOUR_LABELS))).toEqual([]);
  });

  it("LABOUR_LABEL_TO_KEY is a correct, complete reverse map of LABOUR_LABELS", () => {
    for (const [key, label] of Object.entries(LABOUR_LABELS)) {
      expect(LABOUR_LABEL_TO_KEY[label]).toBe(key);
    }
    expect(Object.keys(LABOUR_LABEL_TO_KEY).length).toBe(Object.keys(LABOUR_LABELS).length);
  });

  it("includes an 'Other' catch-all category with an 'other' key", () => {
    expect(LABOUR_LABELS.other).toBeDefined();
    expect(LABOUR_GROUPS.some((g) => g.jobs.includes("other"))).toBe(true);
  });
});

describe("findGroupForLabourCategory", () => {
  it("finds the real group a known category belongs to", () => {
    expect(findGroupForLabourCategory("brake-bleeding")).toBe(
      LABOUR_GROUPS.find((g) => g.jobs.includes("brake-bleeding"))?.group
    );
  });

  it("returns undefined for a genuinely unrecognised category, rather than guessing a group", () => {
    expect(findGroupForLabourCategory("not-a-real-category")).toBeUndefined();
  });
});
