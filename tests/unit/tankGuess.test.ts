import { describe, expect, it } from "vitest";
import { guessFilledToFull, DEFAULT_TANK_CAPACITY_LITRES } from "@/lib/tracker/tankGuess";

describe("guessFilledToFull", () => {
  it("guesses full at or above 60% of the bike's own tank capacity", () => {
    expect(guessFilledToFull(12, 20)).toBe(true); // 60% exactly
    expect(guessFilledToFull(11.9, 20)).toBe(false);
  });

  it("guesses not-full for a genuine partial top-up", () => {
    expect(guessFilledToFull(5, 20)).toBe(false);
  });

  it("falls back to the default 16L capacity when the bike has none on record", () => {
    const threshold = DEFAULT_TANK_CAPACITY_LITRES * 0.6; // 9.6
    expect(guessFilledToFull(threshold, undefined)).toBe(true);
    expect(guessFilledToFull(threshold - 0.1, undefined)).toBe(false);
  });

  it("falls back to the default capacity for a zero or negative recorded capacity too", () => {
    expect(guessFilledToFull(10, 0)).toBe(true); // above the 9.6 default threshold
    expect(guessFilledToFull(10, -5)).toBe(true);
  });
});