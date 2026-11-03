// Place at: src/lib/payments/checkoutTerms.ts
//
// The line Stripe shows above the Pay button on each website checkout
// (Checkout Session custom_text.submit). For a history check it is also the
// buyer's express consent to the check running straight away, which ends
// the 14-day right to cancel once it has run (Consumer Contracts
// Regulations 2013, reg. 37) - the terms, section 6, say the same. Plain
// text, so it reads the same however Stripe renders it.
export const TERMS_URL = "roadverdict.co.uk/terms";

export const HISTORY_CHECK_SUBMIT_MESSAGE =
  `By paying, you ask us to run the check straight away and agree that you lose your right to cancel once it has run. ` +
  `If it doesn't work or isn't as described, your legal rights still apply. Terms: ${TERMS_URL}`;

export const PRO_SUBMIT_MESSAGE =
  `Pro renews automatically until you cancel, which you can do at any time. ` +
  `Cancel within 14 days of your first payment and we'll refund it. Terms: ${TERMS_URL}`;

export const EXTRA_VEHICLE_SUBMIT_MESSAGE =
  `Each extra vehicle renews monthly with Pro until you remove it, which you can do at any time. Terms: ${TERMS_URL}`;

export function submitText(message: string) {
  return { submit: { message } };
}
