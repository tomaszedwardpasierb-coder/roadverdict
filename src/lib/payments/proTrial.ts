// Place at: src/lib/payments/proTrial.ts
//
// The two rules for Pro's free trial, kept apart from proSubscription.ts
// (which pulls in Stripe and email) so anything can ask them cheaply - the
// app's account screen, the free vehicle-history report check, /pro.
import type { UserDoc } from "@/lib/tracker/userDoc";
import { PRO_TRIAL_DAYS } from "@/lib/proPlan";

// One trial per account, and only for someone who has never had a Stripe
// Pro subscription - stripeCustomerId is only ever set by one, and is kept
// after it ends.
export function isEligibleForProTrial(user: UserDoc | null): boolean {
  return PRO_TRIAL_DAYS > 0 && !user?.stripeCustomerId && !user?.proTrialStartedAt;
}

// True while a free trial is running - Pro, but not yet paid for.
export function isInProTrial(user: UserDoc | null, nowMs = Date.now()): boolean {
  const ends = user?.plan?.trialEndsAt;
  return !!ends && new Date(ends).getTime() > nowMs;
}
