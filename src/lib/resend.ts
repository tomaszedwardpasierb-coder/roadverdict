// Place at: src/lib/resend.ts
import { Resend } from "resend";
let resendInstance: Resend | null = null;
// Lazily created for the same reason as getContainer() in cosmos.ts:
// Next.js inspects this module during `next build`, and constructing
// Resend eagerly at import time throws if RESEND_API_KEY isn't set at
// build time (it's only ever needed at actual request time).
function getResend(): Resend {
  if (resendInstance) return resendInstance;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY environment variable");
  }
  resendInstance = new Resend(apiKey);
  return resendInstance;
}
const FROM = "RoadVerdict <noreply@mail.roadverdict.co.uk>";

// Anything interpolated into an HTML email body must go through this -
// unlike React's JSX (which escapes automatically), a raw template
// literal does not. buyerMessage specifically is filled in by an
// anonymous, unauthenticated visitor to the public report page, so it
// must never be trusted as safe HTML just because it looks like a short
// note - the same rule applies to any other field reaching these
// templates, since escaping unconditionally is cheap and getting it
// right selectively is not.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendMagicLinkEmail(email: string, link: string) {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Your RoadVerdict sign-in link",
    html: `
      <p>Click the link below to sign in to RoadVerdict. This link expires in 15 minutes and can only be used once.</p>
      <p><a href="${link}">Sign in to RoadVerdict</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}
export async function sendReminderEmail(email: string, reminderName: string, detail: string) {
  const resend = getResend();
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Reminder: ${reminderName} is due`,
    html: `
      <p>Hi,</p>
      <p>Your reminder for <strong>${escapeHtml(reminderName)}</strong> is now due - ${escapeHtml(detail)}.</p>
      <p>Sign in to your <a href="${appUrl}/dashboard">RoadVerdict dashboard</a> to log it and reset this reminder.</p>
    `,
  });
}
export async function sendReceiptRequestEmail(params: {
  ownerEmail: string;
  bikeName: string;
  items: { description: string }[];
  buyerMessage?: string;
  decisionToken: string;
  isReminder?: boolean;
}) {
  const resend = getResend();
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const safeBikeName = escapeHtml(params.bikeName);
  const itemList = params.items.map((i) => `<li>${escapeHtml(i.description)}</li>`).join("");
  const safeBuyerMessage = params.buyerMessage ? escapeHtml(params.buyerMessage) : undefined;
  const approveAllUrl = `${appUrl}/report/receipt-request/decide?token=${params.decisionToken}&action=approve`;
  const declineAllUrl = `${appUrl}/report/receipt-request/decide?token=${params.decisionToken}&action=decline`;
  const reviewUrl = `${appUrl}/report/receipt-request/decide?token=${params.decisionToken}`;

  await resend.emails.send({
    from: FROM,
    to: params.ownerEmail,
    subject: params.isReminder ? `Reminder: receipt request for ${params.bikeName}` : `Receipt request for ${params.bikeName}`,
    html: `
      <p>Hi,</p>
      <p>${params.isReminder ? "A reminder that someone" : "Someone"} viewing your RoadVerdict report for <strong>${safeBikeName}</strong> has requested to see the
      receipts/invoices for:</p>
      <ul>${itemList}</ul>
      ${safeBuyerMessage ? `<p>They added a note: "${safeBuyerMessage}"</p>` : ""}
      <p>These may contain personal details (your name, address, or part of a card number) - only share what
      you're comfortable with.</p>
      <p>
        <a href="${approveAllUrl}">Approve all</a> &nbsp;|&nbsp;
        <a href="${declineAllUrl}">Decline all</a> &nbsp;|&nbsp;
        <a href="${reviewUrl}">Choose individually</a>
      </p>
      <p>No sign-in needed - just one more click on the page that opens to confirm.</p>
    `,
  });
}

export async function sendShareLinkEmail(toEmail: string, bikeName: string, reportUrl: string, expiresAtLabel: string) {
  const resend = getResend();
  const safeBikeName = escapeHtml(bikeName);
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Ownership report for ${bikeName}`,
    html: `
      <p>Hi,</p>
      <p>You've been sent a RoadVerdict ownership report for <strong>${safeBikeName}</strong> - a logged history of service,
      modifications, and bills, shared by the seller.</p>
      <p><a href="${reportUrl}">View the report</a></p>
      <p>This link is valid until ${escapeHtml(expiresAtLabel)}, after which it will be permanently deleted.</p>
    `,
  });
}

function formatBikeName(summary: { make: string; model: string; year?: number; isCustomBuild: boolean }): string {
  const prefix = summary.isCustomBuild ? "Custom build" : summary.year ? String(summary.year) : "";
  return `${prefix} ${summary.make} ${summary.model}`.trim();
}

export async function sendBikeTransferOfferEmail(params: {
  recipientEmail: string;
  ownerEmail: string;
  bikeSummary: { make: string; model: string; year?: number; isCustomBuild: boolean };
  token: string;
}) {
  const resend = getResend();
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const safeBikeName = escapeHtml(formatBikeName(params.bikeSummary));
  const offerUrl = `${appUrl}/bike-transfer/${params.token}`;

  await resend.emails.send({
    from: FROM,
    to: params.recipientEmail,
    subject: `${params.ownerEmail} wants to hand you the RoadVerdict record for a ${safeBikeName}`,
    html: `
      <p>Hi,</p>
      <p><strong>${escapeHtml(params.ownerEmail)}</strong> has offered to hand you the RoadVerdict tracking record for their
      <strong>${safeBikeName}</strong> - its logged service history, mileage, and documentation, continuing under your
      account rather than starting fresh.</p>
      <p><a href="${offerUrl}">View the offer</a></p>
      <p>If you don't have a RoadVerdict account yet, sign in or create one at
      <a href="${appUrl}/login">roadverdict.co.uk/login</a> using this same email address
      (${escapeHtml(params.recipientEmail)}), then come back to this link to accept.</p>
      <p>This offer is valid for 7 days. If you're not expecting this, you can safely ignore this email or decline it
      from the link above.</p>
    `,
  });
}

export async function sendBikeTransferAcceptedEmail(params: {
  ownerEmail: string;
  recipientEmail: string;
  bikeSummary: { make: string; model: string; year?: number; isCustomBuild: boolean };
}) {
  const resend = getResend();
  const safeBikeName = escapeHtml(formatBikeName(params.bikeSummary));

  await resend.emails.send({
    from: FROM,
    to: params.ownerEmail,
    subject: `${params.recipientEmail} accepted the handover for your ${safeBikeName}`,
    html: `
      <p>Hi,</p>
      <p><strong>${escapeHtml(params.recipientEmail)}</strong> has accepted the RoadVerdict record you offered for your
      <strong>${safeBikeName}</strong>. Your own copy is now read-only - a frozen record of everything you logged, kept
      for your own reference, but no longer editable.</p>
      <p>This is expected and can't be undone from here - if that doesn't sound right, reply to
      hello@roadverdict.co.uk and we'll take a look.</p>
    `,
  });
}

// Sent once, 4 weeks after a shareable report link was created, to
// whoever it was addressed to - regardless of whether they ever opened
// the original report. See getShareLinksNeedingFollowUp() in
// shareLink.ts for the query that decides who's eligible, and
// hasActiveTransferRequestForBike() for the check that skips a bike
// already requested or handed off by the time this would send.
//
// reportUrl deliberately points at the existing report page for now,
// not a dedicated request flow - that flow (the CTA on shared reports
// itself) doesn't exist yet as of this email being built. Update this
// once it does, rather than leaving it pointed here permanently.
export async function sendHistoryFollowUpEmail(params: {
  recipientEmail: string;
  bikeSummary: { make: string; model: string; year?: number; isCustomBuild: boolean };
  reportUrl: string;
}) {
  const resend = getResend();
  const safeBikeName = escapeHtml(formatBikeName(params.bikeSummary));

  await resend.emails.send({
    from: FROM,
    to: params.recipientEmail,
    subject: `Bought the bike? Take its history with you`,
    html: `
      <p>If you bought this ${safeBikeName}, don't leave its history behind.</p>
      <p>Request its existing RoadVerdict history and continue building a complete record of its ownership,
      servicing, maintenance and spend - helping you protect your investment and giving the bike a stronger history
      when you eventually sell.</p>
      <p><a href="${params.reportUrl}">Request this bike's history</a></p>
      <p style="color: #888; font-size: 0.9em;">You're getting this because a RoadVerdict report for this bike was shared with you a few weeks ago. If you
      didn't buy it, no action needed - you won't be emailed about it again.</p>
    `,
  });
}
