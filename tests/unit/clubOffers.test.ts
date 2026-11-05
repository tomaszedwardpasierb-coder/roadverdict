import { describe, expect, it } from "vitest";
import { CLUB_ANNUAL_PRICE, CLUB_DISCOUNT_PERCENT, CLUB_MONTHLY_PRICE, CLUB_OFFERS, CLUB_TRIAL_DAYS, clubPath, findClubOffer } from "@/lib/clubOffers";
import { PRO_ANNUAL_PRICE, PRO_MONTHLY_PRICE, PRO_TRIAL_DAYS } from "@/lib/proPlan";
import { proTrialDaysFor } from "@/lib/payments/proTrial";
import type { UserDoc } from "@/lib/tracker/userDoc";

const pence = (price: string) => Math.round(Number(price.replace("£", "")) * 100);

describe("club offers", () => {
  it("finds a club by its code whatever the case or spacing, and nothing for an unknown code", () => {
    expect(findClubOffer("docgb")?.code).toBe("DOCGB");
    expect(findClubOffer(" Mag ")?.code).toBe("MAG");
    expect(findClubOffer("nope")).toBeNull();
    expect(findClubOffer("")).toBeNull();
    expect(findClubOffer(undefined)).toBeNull();
  });

  it("has unique, upper-case, URL-safe codes", () => {
    const codes = CLUB_OFFERS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z0-9]+$/);
    expect(clubPath(CLUB_OFFERS[0])).toBe(`/club/${CLUB_OFFERS[0].code.toLowerCase()}`);
  });

  // Stripe takes the percentage off each invoice and rounds the discount to
  // the nearest penny; the page and the emails must show what it charges.
  it("shows the member prices Stripe will actually charge", () => {
    const afterDiscount = (price: string) => pence(price) - Math.round((pence(price) * CLUB_DISCOUNT_PERCENT) / 100);
    expect(pence(CLUB_MONTHLY_PRICE)).toBe(afterDiscount(PRO_MONTHLY_PRICE));
    expect(pence(CLUB_ANNUAL_PRICE)).toBe(afterDiscount(PRO_ANNUAL_PRICE));
  });
});

describe("proTrialDaysFor", () => {
  const club = findClubOffer("MAG");
  const fresh = { email: "rider@example.com" } as UserDoc;

  it("gives a new account the usual trial, or a club's 3 months instead", () => {
    expect(proTrialDaysFor(fresh)).toBe(PRO_TRIAL_DAYS);
    expect(proTrialDaysFor(null, club)).toBe(CLUB_TRIAL_DAYS);
    expect(proTrialDaysFor(fresh, club)).toBe(CLUB_TRIAL_DAYS);
  });

  it("keeps it to one free period per account, club or not", () => {
    const trialled = { ...fresh, proTrialStartedAt: "2026-10-01T00:00:00.000Z" } as UserDoc;
    const subscribed = { ...fresh, stripeCustomerId: "cus_1" } as UserDoc;
    expect(proTrialDaysFor(trialled, club)).toBe(0);
    expect(proTrialDaysFor(subscribed, club)).toBe(0);
    expect(proTrialDaysFor(trialled)).toBe(0);
  });
});
