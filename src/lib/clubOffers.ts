// Place at: src/lib/clubOffers.ts
//
// Member offers for clubs and riders' organisations (5 Nov 2026): a club's
// members get 3 months of Pro free, then 10% off for as long as they stay.
// The clubs take nothing - the Ducati Owners Club and MAG both asked for
// the 10% to go to their members instead of to them.
//
// Each club has one code, which is also its page: roadverdict.co.uk/club/
// <code>. The page is only linked from the club's own members' page or
// newsletter, and never from the app - Google Play doesn't allow pointing
// app users at a cheaper website price. Sign-ups per club are read from
// Stripe (each subscription carries its club code in metadata).
//
// Pure data, no Cosmos or Stripe, so client components can show the prices.
export interface ClubOffer {
  code: string;
  // As it reads after "members of".
  name: string;
}

// Add a club only once it has said yes.
export const CLUB_OFFERS: readonly ClubOffer[] = [
  { code: "DOCGB", name: "the Ducati Owners Club GB" },
  { code: "MAG", name: "MAG (the Motorcycle Action Group)" },
];

// The free months replace the usual trial, so it stays one per account.
export const CLUB_TRIAL_DAYS = 90;
export const CLUB_TRIAL_LABEL = "3 months";
export const CLUB_DISCOUNT_PERCENT = 10;
// 10% off £5.99 and £59, as Stripe rounds them (59.9p off becomes 60p).
export const CLUB_MONTHLY_PRICE = "£5.39";
export const CLUB_ANNUAL_PRICE = "£53.10";

// Case doesn't matter, so a code typed from a newsletter still works.
export function findClubOffer(code: string | null | undefined): ClubOffer | null {
  const wanted = code?.trim().toUpperCase();
  if (!wanted) return null;
  return CLUB_OFFERS.find((c) => c.code === wanted) ?? null;
}

export function clubPath(club: ClubOffer): string {
  return `/club/${club.code.toLowerCase()}`;
}
