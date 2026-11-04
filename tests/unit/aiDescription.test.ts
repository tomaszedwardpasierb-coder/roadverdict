import { describe, expect, it } from "vitest";

// aiDescription.ts is pure string composition with zero dependencies (no
// AI/Gemini call lives here - the AI-extracted `description` is already
// supplied as input by the caller). Nothing to mock; just exercise every
// branch of how the pieces get assembled/omitted.

import { buildAiDescription, describeWithDetails } from "@/lib/tracker/aiDescription";

describe("buildAiDescription", () => {
  it("names the merchant and town but leaves the street address out of the title", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      merchantName: "Dave's Motorcycles",
      address: "14 High Street",
      city: "Colchester",
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads at Dave's Motorcycles - Colchester (Service)");
  });

  it("omits the merchant clause entirely when merchantName is absent", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      address: "14 High Street",
      city: "Colchester",
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads - Colchester (Service)");
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

  it("drops the place entirely when only a street address is known", () => {
    const result = buildAiDescription({
      description: "Front brake pads",
      merchantName: "Dave's Motorcycles",
      address: "14 High Street",
      categoryLabel: "Service",
    });
    expect(result).toBe("Front brake pads at Dave's Motorcycles (Service)");
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

  it("never puts the street address in the title, even with a town", () => {
    const result = buildAiDescription({
      description: "Tyres",
      address: "1 Main Road",
      city: "Leeds",
      categoryLabel: "Tyres",
    });
    expect(result).toBe("Tyres - Leeds (Tyres)");
  });
});

describe("describeWithDetails", () => {
  it("adds what the job covered after its name", () => {
    expect(describeWithDetails("Full service", "engine oil, oil filter")).toBe("Full service: engine oil, oil filter");
  });

  it("is just the name when there are no details", () => {
    expect(describeWithDetails("MOT test", null)).toBe("MOT test");
    expect(describeWithDetails("MOT test", "  ")).toBe("MOT test");
  });
});
