// The sample bike's figures - what the demo page draws and what its AI is told.
import { describe, expect, it } from "vitest";
import {
  SAMPLE_ENTRIES,
  buildFactsBlock,
  figuresFor,
  fuelEconomy,
  inWindow,
  monthlySpend,
  monthsInWindow,
  spendByCategory,
  type DemoEntry,
} from "@/lib/demo/sampleBike";

describe("the sample bike", () => {
  it("covers exactly 12 months, and every entry falls inside them", () => {
    const months = monthsInWindow();
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-10");
    expect(months[11]).toBe("2026-09");
    expect(SAMPLE_ENTRIES.every((e) => inWindow(e.date))).toBe(true);
  });

  it("charts add up to the same total, whichever way they slice it", () => {
    const total = figuresFor(SAMPLE_ENTRIES).total;
    const byMonth = monthlySpend(SAMPLE_ENTRIES).reduce((s, m) => s + m.total, 0);
    const byCategory = spendByCategory(SAMPLE_ENTRIES).reduce((s, c) => s + c.total, 0);
    expect(Math.round(byMonth * 100) / 100).toBe(total);
    expect(Math.round(byCategory * 100) / 100).toBe(total);
  });

  it("works out plausible running figures", () => {
    const f = figuresFor(SAMPLE_ENTRIES);
    expect(f.total).toBeGreaterThan(900);
    expect(f.total).toBeLessThan(1400);
    expect(f.milesRidden).toBe(1530);
    expect(f.costPerMile).toBeGreaterThan(0.5);
    expect(f.costPerMile).toBeLessThan(1);
    expect(f.averageMpg).toBeGreaterThan(55);
    expect(f.averageMpg).toBeLessThan(70);
    expect(fuelEconomy(SAMPLE_ENTRIES)).toHaveLength(10);
  });

  it("counts a scanned receipt in the totals and the month it's dated in", () => {
    const scanned: DemoEntry = { id: "s", date: "2026-09-24", category: "service", description: "Full service", cost: 199, scanned: true };
    const before = figuresFor(SAMPLE_ENTRIES);
    const after = figuresFor([scanned, ...SAMPLE_ENTRIES]);
    expect(after.total).toBeCloseTo(before.total + 199, 2);
    expect(after.servicing).toBeCloseTo(before.servicing + 199, 2);
    const september = (entries: DemoEntry[]) => monthlySpend(entries).find((m) => m.month === "2026-09")?.total ?? 0;
    expect(september([scanned, ...SAMPLE_ENTRIES])).toBeCloseTo(september(SAMPLE_ENTRIES) + 199, 2);
  });

  it("leaves a receipt dated outside the 12 months out of the figures", () => {
    const old: DemoEntry = { id: "o", date: "2019-03-01", category: "service", description: "Old service", cost: 500, scanned: true };
    expect(figuresFor([old, ...SAMPLE_ENTRIES]).total).toBe(figuresFor(SAMPLE_ENTRIES).total);
  });

  it("hands the AI every figure in words, and marks the visitor's own receipt", () => {
    const scanned: DemoEntry = { id: "s", date: "2026-09-24", category: "service", description: "Full service", cost: 199, scanned: true };
    const facts = buildFactsBlock([scanned, ...SAMPLE_ENTRIES]);
    expect(facts).toContain("Total spent:");
    expect(facts).toContain("Spent on servicing and labour together:");
    expect(facts).toContain("Running cost per mile:");
    expect(facts).toContain("Insurance renewal (18 October 2026)");
    expect(facts).toContain("scanned from the visitor's receipt");
  });
});
