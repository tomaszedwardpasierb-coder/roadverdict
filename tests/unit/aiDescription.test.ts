import { describe, expect, it } from "vitest";

// aiDescription.ts is pure string composition with zero dependencies (no
// AI/Gemini call lives here - the AI-extracted `description` is already
// supplied as input by the caller). Nothing to mock; just exercise every
// branch of how the pieces get assembled/omitted.

import { buildAiDescription } from "@/lib/tracker/aiDescription";

describe("buildAiDescription", () => {
  it("composes merchant and place into the full form when everything is present", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      merchantName: "Dave's Motorcycles",
      address: "14 High Street",
      city: "Colchester",
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads at Dave's Motorcycles - 14 High Street, Colchester (Service)");
  });

  it("omits the merchant clause entirely when merchantName is absent", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      address: "14 High Street",
      city: "Colchester",
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads - 14 High Street, Colchester (Service)");
  });

  it("omits the merchant clause when merchantName is null", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      merchantName: null,
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads (Service)");
  });

  it("omits the merchant clause when merchantName is an empty string", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      merchantName: "",
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads (Service)");
  });

  it("drops the place segment entirely (no stray dash) when both address and city are absent", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      merchantName: "Dave's Motorcycles",
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads at Dave's Motorcycles (Service)");
  });

  it("uses just the address when city is absent", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      merchantName: "Dave's Motorcycles",
      address: "14 High Street",
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads at Dave's Motorcycles - 14 High Street (Service)");
  });

  it("uses just the city when address is absent", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      merchantName: "Dave's Motorcycles",
      city: "Colchester",
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads at Dave's Motorcycles - Colchester (Service)");
  });

  it("treats a whitespace-only address as absent", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      merchantName: "Dave's Motorcycles",
      address: "   ",
      city: "Colchester",
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads at Dave's Motorcycles - Colchester (Service)");
  });

  it("treats a null address and null city as absent, alongside a null merchantName", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      merchantName: null,
      address: null,
      city: null,
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads (Service)");
  });

  it("always appends the category label in parentheses, even in the minimal case", () => {
    const result = buildAiDescription({ description: "Oil change", categoryLabel: "Maintenance" });
    expect(result).toBe("Oil change (Maintenance)");
  });

  it("joins address and city with a comma-space when both are present", () => {
    const result = buildAiDescription({
      description: "Tyres",
      address: "1 Main Road",
      city: "Leeds",
      categoryLabel: "Tyres",
    });
    expect(result).toContain("1 Main Road, Leeds");
  });
});
