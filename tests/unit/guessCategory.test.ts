import { describe, expect, it } from "vitest";
import { guessJobType, guessModCategory, guessBillType } from "@/lib/tracker/guessCategory";

describe("guessJobType", () => {
  it("matches a description against a real job label", () => {
    expect(guessJobType("oil and filter change")).toBe("oil-filter");
  });

  // Scans are asked for these exact names; word counting alone ties
  // "check/adjustment" lookalikes and picks the first label in the list.
  it("takes an exact job name before counting words", () => {
    expect(guessJobType("Chain and sprockets")).toBe("chain-and-sprockets");
    expect(guessJobType(" full service ")).toBe("full-service");
  });

  it("returns null when nothing matches", () => {
    expect(guessJobType("xyz totally unrelated qwerty")).toBeNull();
  });

  it("returns null for a description with no words long enough to count", () => {
    expect(guessJobType("a to it")).toBeNull(); // all words <=2 chars, filtered out
  });
});

describe("guessModCategory", () => {
  it("matches a description against a real mod label", () => {
    expect(guessModCategory("new exhaust can")).toBe("exhaust-can");
  });
});

describe("guessBillType", () => {
  it("matches a description against a real bill label", () => {
    expect(guessBillType("annual insurance renewal")).toBe("insurance");
  });

  // Picks whichever label has the most matching words, not just the
  // first one that matches at all.
  it("picks the label with the most matching words when more than one could match", () => {
    expect(guessBillType("road tax renewal")).toBe("road-tax");
  });
});