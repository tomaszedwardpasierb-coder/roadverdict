import { describe, expect, it } from "vitest";
import { findGroupForCategory, MOD_GROUPS } from "@/lib/tracker/modTypes";

describe("findGroupForCategory", () => {
  it("finds the real group a known category belongs to", () => {
    expect(findGroupForCategory("exhaust-can")).toBe(
      MOD_GROUPS.find((g) => g.subgroups.some((sg) => sg.mods.includes("exhaust-can")))?.group
    );
  });

  // A real fallback, not an error - an unrecognised or legacy category
  // string must still land somewhere sensible rather than breaking the
  // grouped display.
  it("falls back to the first group for a genuinely unrecognised category", () => {
    expect(findGroupForCategory("not-a-real-category")).toBe(MOD_GROUPS[0].group);
  });
});