import { describe, expect, it } from "vitest";
import { findPossibleDuplicate, type DuplicateCheckCandidate } from "@/lib/tracker/duplicateCheck";

describe("findPossibleDuplicate", () => {
  it("returns null when there's nothing to compare against", () => {
    expect(findPossibleDuplicate("2025-06-01", 50, [])).toBeNull();
  });

  it("finds a match within the date and cost windows", () => {
    const existing: DuplicateCheckCandidate[] = [
      { id: "e1", date: "2025-06-02", cost: 50, description: "Oil change" },
    ];
    expect(findPossibleDuplicate("2025-06-01", 50, existing)?.id).toBe("e1");
  });

  it("matches exactly at the 3-day date window boundary", () => {
    const existing: DuplicateCheckCandidate[] = [
      { id: "e1", date: "2025-06-04", cost: 50, description: "Oil change" },
    ];
    expect(findPossibleDuplicate("2025-06-01", 50, existing)?.id).toBe("e1");
  });

  it("does not match just past the date window", () => {
    const existing: DuplicateCheckCandidate[] = [
      { id: "e1", date: "2025-06-05", cost: 50, description: "Oil change" },
    ];
    expect(findPossibleDuplicate("2025-06-01", 50, existing)).toBeNull();
  });

  it("matches exactly at the 50p cost tolerance boundary", () => {
    const existing: DuplicateCheckCandidate[] = [
      { id: "e1", date: "2025-06-01", cost: 50.5, description: "Oil change" },
    ];
    expect(findPossibleDuplicate("2025-06-01", 50, existing)?.id).toBe("e1");
  });

  it("does not match just past the cost tolerance", () => {
    const existing: DuplicateCheckCandidate[] = [
      { id: "e1", date: "2025-06-01", cost: 50.51, description: "Oil change" },
    ];
    expect(findPossibleDuplicate("2025-06-01", 50, existing)).toBeNull();
  });

  it("skips description comparison entirely when no candidate description is given", () => {
    const existing: DuplicateCheckCandidate[] = [
      { id: "e1", date: "2025-06-01", cost: 50, description: "Completely unrelated wording" },
    ];
    expect(findPossibleDuplicate("2025-06-01", 50, existing)?.id).toBe("e1");
  });

  it("matches when descriptions share enough significant words", () => {
    const existing: DuplicateCheckCandidate[] = [
      { id: "e1", date: "2025-06-01", cost: 50, description: "Full service and oil change" },
    ];
    expect(
      findPossibleDuplicate("2025-06-01", 50, existing, "Oil change")?.id
    ).toBe("e1");
  });

  // The exact scenario named in the source comment: a multi-line garage
  // invoice with two line items that happen to cost the same on the
  // same date - genuinely different work, correctly not a duplicate.
  it("does not match when date and cost line up but descriptions are genuinely different", () => {
    const existing: DuplicateCheckCandidate[] = [
      { id: "e1", date: "2025-06-01", cost: 50, description: "Front brake pads" },
    ];
    expect(findPossibleDuplicate("2025-06-01", 50, existing, "Rear tyre")).toBeNull();
  });

  // Falls back to matching on date and cost alone when a description
  // has no significant words - a description that's entirely stop
  // words reduces to nothing after filtering, same as an empty string.
  it("falls back to matching on date and cost alone when a description has no significant words", () => {
    const existing: DuplicateCheckCandidate[] = [
      { id: "e1", date: "2025-06-01", cost: 50, description: "and the" },
    ];
    expect(findPossibleDuplicate("2025-06-01", 50, existing, "Front brake pads")?.id).toBe("e1");
  });

  // A real discrepancy discovered by actually running this test, not
  // assumed going in: the source's own comment names "Other" as an
  // example of a description that "reduces to nothing meaningful," but
  // STOP_WORDS doesn't actually contain "other" - so it's treated as a
  // normal one-word signal, not a meaningless one. "Other" is a common
  // catch-all label elsewhere in this app (bill types, mod categories),
  // so this means a genuine duplicate - one entry generically labelled
  // "Other", another logged with a specific description for the same
  // date and cost - can be missed, in exactly the situation the
  // comment says it shouldn't be. Pinned here so it's a known, tracked
  // fact rather than a silent gap between intent and behaviour.
  it("does NOT treat 'Other' as falling back to permissive matching, despite what the source comment implies", () => {
    const existing: DuplicateCheckCandidate[] = [
      { id: "e1", date: "2025-06-01", cost: 50, description: "Other" },
    ];
    expect(findPossibleDuplicate("2025-06-01", 50, existing, "Front brake pads")).toBeNull();
  });

  // Picks the closest match by date, not just the first candidate found
  // in array order.
  it("picks the closest candidate by date when several are within tolerance", () => {
    const existing: DuplicateCheckCandidate[] = [
      { id: "far", date: "2025-06-03", cost: 50, description: "Oil change" },
      { id: "close", date: "2025-06-01", cost: 50, description: "Oil change" },
    ];
    expect(findPossibleDuplicate("2025-06-01", 50, existing)?.id).toBe("close");
  });
});