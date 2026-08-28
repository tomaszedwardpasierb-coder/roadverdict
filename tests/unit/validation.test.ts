import { describe, expect, it } from "vitest";
import { buyingGuideRequestSchema, costCalculatorRequestSchema, quoteRequestSchema } from "@/lib/validation";

describe("request validation", () => {
  it("accepts a valid quote request", () => {
    expect(
      quoteRequestSchema.safeParse({
        bikeClass: "medium",
        jobType: "full-service",
        brand: "honda",
        region: "rest-england-wales",
        quotedPrice: 350,
      }).success
    ).toBe(true);
  });

  it("rejects unsafe quote prices and unknown job types", () => {
    expect(quoteRequestSchema.safeParse({
      bikeClass: "medium",
      jobType: "unknown",
      brand: "honda",
      region: "rest-england-wales",
      quotedPrice: 0,
    }).success).toBe(false);
    expect(quoteRequestSchema.safeParse({
      bikeClass: "medium",
      jobType: "full-service",
      brand: "honda",
      region: "rest-england-wales",
      quotedPrice: 5001,
    }).success).toBe(false);
  });

  it("bounds annual mileage and accepts buying-guide inputs", () => {
    expect(costCalculatorRequestSchema.safeParse({
      bikeClass: "small",
      brand: "honda",
      region: "scotland-ni",
      annualMileage: 30001,
    }).success).toBe(false);
    expect(buyingGuideRequestSchema.safeParse({
      bikeClass: "large",
      brand: "yamaha",
      ageBand: "used",
    }).success).toBe(true);
  });
});