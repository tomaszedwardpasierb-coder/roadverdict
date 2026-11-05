// Place at: src/lib/payments/proTrial.ts
//
// The two rules for Pro's free trial, kept apart from proSubscription.ts
// (which pulls in Stripe and email) so anything can ask them cheaply - the
// app's account screen, the free vehicle-history report check, /pro.
import type { UserDoc } from "@/lib/tracker/userDoc";
import { PRO_TRIAL_DAYS } from "@/lib/proPlan";
import { CLUB_TRIAL_DAYS, type ClubOffer } from "@/lib/clubOffers";

// One trial per account, and only for someone who has never had a Stripe
// Pro subscription - stripeCustomerId is only ever set by one, and is kept
// after it ends.
function neverHadPro(user: UserDoc | null): boolean {
  return !user?.stripeCustomerId && !user?.proTrialStartedAt;
}

export function isEligibleForProTrial(user: UserDoc | null): boolean {
  return PRO_TRIAL_DAYS > 0 && neverHadPro(user);
}

// The free days this account gets at checkout: a club's 3 months instead of
// the usual trial, under the same one-per-account rule.
export function proTrialDaysFor(user: UserDoc | null, club: ClubOffer | null = null): number {
  if (club) return neverHadPro(user) ? CLUB_TRIAL_DAYS : 0;
  return isEligibleForProTrial(user) ? PRO_TRIAL_DAYS : 0;
}

// True while a free trial is running - Pro, but not yet paid for.
export function isInProTrial(user: UserDoc | null, nowMs = Date.now()): boolean {
  const ends = user?.plan?.trialEndsAt;
  return !!ends && new Date(ends).getTime() > nowMs;
}
