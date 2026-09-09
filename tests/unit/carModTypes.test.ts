import { describe, expect, it } from "vitest";
import { findGroupForCarCategory, CAR_MOD_GROUPS, CAR_MOD_LABEL_TO_KEY } from "@/lib/tracker/carModTypes";
import { CAR_MOD_LABELS } from "@/lib/tracker/carModTypes";

describe("findGroupForCarCategory", () => {
  it("finds the real group a known category belongs to", () => {
    expect(findGroupForCarCategory("dash-cam")).toBe(
      CAR_MOD_GROUPS.find((g) => g.subgroups.some((sg) => sg.mods.includes("dash-cam")))?.group
    );
  });

  // A real fallback, not an error - an unrecognised or legacy category
  // string must still land somewhere sensible rather than breaking the
  // grouped display.
  it("falls back to the first group for a genuinely unrecognised category", () => {
    expect(findGroupForCarCategory("not-a-real-category")).toBe(CAR_MOD_GROUPS[0].group);
  });
});

describe("CAR_MOD_GROUPS/CAR_MOD_LABEL_TO_KEY completeness", () => {
  it("every CAR_MOD_LABELS key appears in exactly one CAR_MOD_GROUPS entry", () => {
    const allKeysInGroups = CAR_MOD_GROUPS.flatMap((g) => g.subgroups.flatMap((sg) => sg.mods));
    expect(new Set(allKeysInGroups).size).toBe(allKeysInGroups.length); // no duplicates across groups
    expect(new Set(allKeysInGroups)).toEqual(new Set(Object.keys(CAR_MOD_LABELS)));
  });

  it("CAR_MOD_LABEL_TO_KEY is the exact reverse of CAR_MOD_LABELS", () => {
    for (const [key, label] of Object.entries(CAR_MOD_LABELS)) {
      expect(CAR_MOD_LABEL_TO_KEY[label]).toBe(key);
    }
  });
});
