import { describe, expect, it } from "vitest";
import { guessCarJobType, guessCarModCategory, guessCarBillType } from "@/lib/tracker/carGuessCategory";

describe("guessCarJobType", () => {
  it("matches a description against a real car job label", () => {
    expect(guessCarJobType("dpf cleaning service")).toBe("dpf-clean");
  });

  it("matches cambelt specifically, not a motorcycle-only job", () => {
    expect(guessCarJobType("cambelt and water pump replacement")).toBe("cambelt");
  });

  it("returns null when nothing matches", () => {
    expect(guessCarJobType("xyz totally unrelated qwerty")).toBeNull();
  });
});

describe("guessCarModCategory", () => {
  it("matches a description against a real car mod label", () => {
    expect(guessCarModCategory("new dash cam")).toBe("dash-cam");
  });
});

describe("guessCarBillType", () => {
  it("matches a description against a shared bill label (reused from billTypes.ts)", () => {
    expect(guessCarBillType("annual insurance renewal")).toBe("insurance");
  });

  it("matches a car-only bill label with no motorcycle equivalent", () => {
    expect(guessCarBillType("congestion charge payment")).toBe("congestion");
  });
});
