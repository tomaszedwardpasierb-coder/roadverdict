// Place at: tests/unit/reportPricingCopy.test.ts
//
// The public wording of the full vehicle history report's price is built from
// the real price constants, so it can't drift from what checkout charges, and
// it never calls Pro "Premium" or implies Pro costs the report's price.
import { describe, expect, it } from "vitest";
import { BUYING_GUIDE_REPORT_PRICE_LABEL } from "@/lib/payments/pricing";
import { PRO_ANNUAL_PRICE, PRO_MONTHLY_PRICE } from "@/lib/proPlan";
import { REPORT_PRICE_SUMMARY, REPORT_PRICING_FAQ } from "@/lib/seo/reportPricingCopy";

describe("REPORT_PRICE_SUMMARY", () => {
  it("gives both account prices and says Pro includes one every 4 weeks", () => {
    expect(REPORT_PRICE_SUMMARY).toContain(BUYING_GUIDE_REPORT_PRICE_LABEL.freeNoVehicle);
    expect(REPORT_PRICE_SUMMARY).toContain(BUYING_GUIDE_REPORT_PRICE_LABEL.freeWithVehicle);
    expect(REPORT_PRICE_SUMMARY).toMatch(/once you’ve added a vehicle to a free account/);
    expect(REPORT_PRICE_SUMMARY).toMatch(/Included with Pro, one every 4 weeks/);
  });
});

describe("REPORT_PRICING_FAQ", () => {
  const [price, inPro] = REPORT_PRICING_FAQ;

  it("answers the price question with the real prices", () => {
    expect(price.question).toMatch(/how much/i);
    for (const label of [BUYING_GUIDE_REPORT_PRICE_LABEL.freeNoVehicle, BUYING_GUIDE_REPORT_PRICE_LABEL.freeWithVehicle, BUYING_GUIDE_REPORT_PRICE_LABEL.pro]) {
      expect(price.answer).toContain(label);
    }
  });

  it("says Pro includes a report every 4 weeks, and that the trial doesn't include the free one", () => {
    expect(inPro.question).toMatch(/included in Pro/i);
    expect(inPro.answer).toMatch(/one full vehicle history report every 4 weeks/);
    expect(inPro.answer).toMatch(/during the 14-day free trial a report costs £9\.99/);
    expect(inPro.answer).toContain(PRO_MONTHLY_PRICE);
    expect(inPro.answer).toContain(PRO_ANNUAL_PRICE);
  });

  it("says Pro, never Premium, and makes no 'worth' value claim", () => {
    for (const f of REPORT_PRICING_FAQ) {
      expect(f.answer).not.toMatch(/premium/i);
      expect(f.answer).not.toMatch(/worth/i);
    }
  });
});
