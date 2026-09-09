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

// Branded HTML shell shared by the templates below. Email clients don't
// see globals.css - most (Outlook desktop especially) ignore <style>
// blocks, CSS variables, and flexbox entirely - so every colour/font
// here is the literal value var(--asphalt)/var(--amber)/etc. resolve to
// in globals.css, and layout uses <table> rather than flex/grid. The
// logo, header colour, and card treatment intentionally replicate the
// real site-header (asphalt background + logo-dark.png) rather than a
// new look invented for email, since that combination is already the
// one running in production on every page.
//
// Logo dimensions: logo-dark.png is 232×145px (aspect ratio ~1.6:1).
// Rendered at width=116 height=72 (half size — sharp on retina, correct
// ratio). The previous width=150 height=42 was wrong on both dimensions
// and caused visible stretching in every email client.
//
// Card width: 600px is the standard safe email width. Gmail's reading
// pane clips anything wider; most clients render 600px full-bleed
// without horizontal scroll. The previous 560px was valid but left
// visible empty space on desktop clients.
function renderEmailLayout(params: { preheader: string; heading: string; bodyHtml: string }): string {
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RoadVerdict</title>
  </head>
  <body style="margin:0;padding:0;background:#F3F1EC;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(params.preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#F3F1EC;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E4E0D6;border-radius:12px;overflow:hidden;">
            <!-- Header -->
            <tr>
              <td style="background:#17181B;padding:28px 36px;">
                <img src="${appUrl}/logo-dark.png" alt="RoadVerdict" width="116" height="72" style="display:block;border:0;width:116px;height:72px;">
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:36px;font-family:Inter,Arial,sans-serif;color:#1C1D20;">
                <h1 style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:22px;line-height:1.3;font-weight:700;color:#1C1D20;">${escapeHtml(params.heading)}</h1>
                <div style="font-size:15px;line-height:1.7;color:#1C1D20;">
                  ${params.bodyHtml}
                </div>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:20px 36px 28px;border-top:1px solid #E4E0D6;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.6;color:#54555A;">
                <p style="margin:0;">RoadVerdict &middot; <a href="${appUrl}" style="color:#54555A;text-decoration:underline;">roadverdict.co.uk</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// "Bulletproof" table-cell button rather than a styled <a> alone -
// Outlook desktop drops border-radius/box-shadow but still renders the
// coloured cell and padding correctly, so it degrades to a square amber
// button rather than an unstyled text link.
function emailButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 20px;">
    <tr>
      <td align="center" bgcolor="#EE9A2E" style="border-radius:10px;">
        <a href="${url}" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#17181B;text-decoration:none;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

export async function sendMagicLinkEmail(email: string, link: string) {
  const resend = getResend();
  const html = renderEmailLayout({
    preheader: "Your secure sign-in link - expires in 15 minutes.",
    heading: "Sign in to RoadVerdict",
    bodyHtml: `
      <p style="margin:0 0 8px;">Click the button below to sign in. This link expires in 15 minutes and can only be used once.</p>
      ${emailButton("Sign in to RoadVerdict", link)}
      <p style="margin:0;color:#54555A;font-size:13px;">If you didn't request this, you can safely ignore this email - no action is needed.</p>
    `,
  });
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Your RoadVerdict sign-in link",
    html,
  });
}
export async function sendReminderEmail(email: string, reminderName: string, detail: string) {
  const resend = getResend();
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const html = renderEmailLayout({
    preheader: `${reminderName} is due`,
    heading: `Reminder: ${reminderName}`,
    bodyHtml: `
      <p style="margin:0 0 8px;">Hi,</p>
      <p style="margin:0 0 8px;">Your reminder for <strong>${escapeHtml(reminderName)}</strong> is now due - ${escapeHtml(detail)}.</p>
      ${emailButton("Go to your dashboard", `${appUrl}/dashboard`)}
    `,
  });
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Reminder: ${reminderName} is due`,
    html,
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
  const itemList = params.items.map((i) => `<li style="margin-bottom:4px;">${escapeHtml(i.description)}</li>`).join("");
  const safeBuyerMessage = params.buyerMessage ? escapeHtml(params.buyerMessage) : undefined;
  const approveAllUrl = `${appUrl}/report/receipt-request/decide?token=${params.decisionToken}&action=approve`;
  const declineAllUrl = `${appUrl}/report/receipt-request/decide?token=${params.decisionToken}&action=decline`;
  const reviewUrl = `${appUrl}/report/receipt-request/decide?token=${params.decisionToken}`;

  const html = renderEmailLayout({
    preheader: params.isReminder
      ? `Reminder: a buyer is waiting for receipts on your ${params.bikeName}`
      : `A buyer has requested receipts for your ${params.bikeName}`,
    heading: params.isReminder ? `Reminder: receipt request for your ${params.bikeName}` : `Receipt request for your ${params.bikeName}`,
    bodyHtml: `
      <p style="margin:0 0 12px;">${params.isReminder ? "A reminder that someone" : "Someone"} viewing your RoadVerdict report for <strong>${safeBikeName}</strong> has requested to see the receipts or invoices for:</p>
      <ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.7;">${itemList}</ul>
      ${safeBuyerMessage ? `<p style="margin:0 0 12px;padding:12px 16px;background:#F3F1EC;border-radius:8px;font-style:italic;">&ldquo;${safeBuyerMessage}&rdquo;</p>` : ""}
      <p style="margin:0 0 20px;">These may contain personal details (your name, address, or part of a card number) — only share what you're comfortable with.</p>
      ${emailButton("Review and decide", reviewUrl)}
      <p style="margin:0 0 8px;font-size:13px;">Or decide in one click: <a href="${approveAllUrl}" style="color:#1C1D20;font-weight:600;">Approve all</a> &nbsp;&middot;&nbsp; <a href="${declineAllUrl}" style="color:#1C1D20;font-weight:600;">Decline all</a></p>
      <p style="margin:0;color:#54555A;font-size:13px;">No sign-in needed — just one more click on the page that opens to confirm.</p>
    `,
  });

  await resend.emails.send({
    from: FROM,
    to: params.ownerEmail,
    subject: params.isReminder ? `Reminder: receipt request for ${params.bikeName}` : `Receipt request for ${params.bikeName}`,
    html,
  });
}

export async function sendShareLinkEmail(toEmail: string, bikeName: string, reportUrl: string, expiresAtLabel: string) {
  const resend = getResend();
  const safeBikeName = escapeHtml(bikeName);

  const html = renderEmailLayout({
    preheader: `You've been sent a verified ownership report for a ${bikeName}`,
    heading: `Ownership report for ${bikeName}`,
    bodyHtml: `
      <p style="margin:0 0 12px;">You've been sent a RoadVerdict ownership report for a <strong>${safeBikeName}</strong> — a logged history of services, modifications, and bills, shared directly by the seller.</p>
      ${emailButton("View the ownership report", reportUrl)}
      <p style="margin:0;color:#54555A;font-size:13px;">This link is valid until ${escapeHtml(expiresAtLabel)}, after which it will be permanently deleted.</p>
    `,
  });

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Ownership report for ${bikeName}`,
    html,
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

  const html = renderEmailLayout({
    preheader: `${params.ownerEmail} wants to hand you the service history for a ${formatBikeName(params.bikeSummary)}`,
    heading: `You've been offered a bike's history`,
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong>${escapeHtml(params.ownerEmail)}</strong> has offered to hand you the RoadVerdict record for their <strong>${safeBikeName}</strong> — its full logged service history, mileage, and documentation, continuing under your account rather than starting fresh.</p>
      ${emailButton("View the offer", offerUrl)}
      <p style="margin:0 0 12px;color:#54555A;font-size:13px;">If you don't have a RoadVerdict account yet, sign in or create one at <a href="${appUrl}/login" style="color:#54555A;">roadverdict.co.uk/login</a> using this same email address (${escapeHtml(params.recipientEmail)}), then come back to this link to accept.</p>
      <p style="margin:0;color:#54555A;font-size:13px;">This offer is valid for 7 days. If you're not expecting this, you can safely ignore this email or decline it from the link above.</p>
    `,
  });

  await resend.emails.send({
    from: FROM,
    to: params.recipientEmail,
    subject: `${params.ownerEmail} wants to hand you the RoadVerdict record for a ${safeBikeName}`,
    html,
  });
}

export async function sendBikeTransferAcceptedEmail(params: {
  ownerEmail: string;
  recipientEmail: string;
  bikeSummary: { make: string; model: string; year?: number; isCustomBuild: boolean };
}) {
  const resend = getResend();
  const safeBikeName = escapeHtml(formatBikeName(params.bikeSummary));

  const html = renderEmailLayout({
    preheader: `${params.recipientEmail} has accepted the handover for your ${formatBikeName(params.bikeSummary)}`,
    heading: `Handover accepted`,
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong>${escapeHtml(params.recipientEmail)}</strong> has accepted the RoadVerdict record you offered for your <strong>${safeBikeName}</strong>.</p>
      <p style="margin:0 0 20px;">Your own copy is now read-only — a frozen record of everything you logged, kept for your own reference, but no longer editable.</p>
      <p style="margin:0;color:#54555A;font-size:13px;">This is expected and can't be undone from here. If that doesn't sound right, reply to <a href="mailto:hello@roadverdict.co.uk" style="color:#54555A;">hello@roadverdict.co.uk</a> and we'll take a look.</p>
    `,
  });

  await resend.emails.send({
    from: FROM,
    to: params.ownerEmail,
    subject: `${params.recipientEmail} accepted the handover for your ${safeBikeName}`,
    html,
  });
}

// Sent once, 4 weeks after a shareable report link was created, to
// whoever it was addressed to - regardless of whether they ever opened
// the original report. See getShareLinksNeedingFollowUp() in
// shareLink.ts for the query that decides who's eligible, and
// hasActiveTransferRequestForBike() for the check that skips a bike
// already requested or handed off by the time this would send.
//
// reportUrl points at the detailed report page specifically, since
// that's where the actual request-history CTA lives (RequestHistoryCta,
// on the detailed page) - not the basic summary page.
export async function sendHistoryFollowUpEmail(params: {
  recipientEmail: string;
  bikeSummary: { make: string; model: string; year?: number; isCustomBuild: boolean };
  reportUrl: string;
}) {
  const resend = getResend();
  const safeBikeName = escapeHtml(formatBikeName(params.bikeSummary));

  const html = renderEmailLayout({
    preheader: `Bought the ${formatBikeName(params.bikeSummary)}? Keep its history alive`,
    heading: `Bought this bike? Keep its history alive.`,
    bodyHtml: `
      <p style="margin:0 0 12px;">The RoadVerdict report you were sent for this <strong>${safeBikeName}</strong> was real, logged history — not guesswork. If you've bought it, you can carry that same record forward under your own free RoadVerdict account, instead of starting from a blank page.</p>
      <p style="margin:0 0 20px;">It's what will make your eventual buyer trust this bike too, the same way you just did.</p>
      ${emailButton("Request this bike's history", params.reportUrl)}
      <p style="margin:0;color:#54555A;font-size:13px;">You're receiving this because a RoadVerdict report for this bike was shared with you a few weeks ago. If you didn't buy it, no action needed — you won't be emailed about it again.</p>
    `,
  });

  await resend.emails.send({
    from: FROM,
    to: params.recipientEmail,
    subject: `Bought the ${safeBikeName}? Keep its history alive`,
    html,
  });
}

// The reverse of sendBikeTransferOfferEmail - here the stranger is the
// one initiating, and the current owner is the one who needs to act.
// Deliberately never names the requester's account details beyond
// their email (which they themselves supplied when requesting) - the
// owner learns who's asking, not anything else about them.
export async function sendIncomingOwnershipRequestEmail(params: {
  ownerEmail: string;
  requesterEmail: string;
  bikeSummary: { make: string; model: string; year?: number; isCustomBuild: boolean };
}) {
  const resend = getResend();
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const safeBikeName = escapeHtml(formatBikeName(params.bikeSummary));

  const html = renderEmailLayout({
    preheader: `${params.requesterEmail} is requesting your ${formatBikeName(params.bikeSummary)}'s RoadVerdict history`,
    heading: `Someone is requesting your bike's history`,
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong>${escapeHtml(params.requesterEmail)}</strong> has requested the RoadVerdict history for your <strong>${safeBikeName}</strong>.</p>
      <p style="margin:0 0 20px;">If you've sold it to them, approving this hands over its logged service history, mileage, and documentation to their account — and your own copy becomes read-only.</p>
      ${emailButton("Review this request", `${appUrl}/dashboard`)}
      <p style="margin:0;color:#54555A;font-size:13px;">If you don't recognise this request, or haven't sold the bike, you can safely decline it from the same place — nothing changes unless you approve it.</p>
    `,
  });

  await resend.emails.send({
    from: FROM,
    to: params.ownerEmail,
    subject: `${params.requesterEmail} is requesting your ${safeBikeName}'s RoadVerdict history`,
    html,
  });
}

export async function sendOwnershipRequestApprovedEmail(params: {
  requesterEmail: string;
  bikeSummary: { make: string; model: string; year?: number; isCustomBuild: boolean };
}) {
  const resend = getResend();
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const safeBikeName = escapeHtml(formatBikeName(params.bikeSummary));

  const html = renderEmailLayout({
    preheader: `Your request for the ${formatBikeName(params.bikeSummary)}'s history has been approved`,
    heading: `History request approved`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Your request for the <strong>${safeBikeName}</strong>'s RoadVerdict history has been approved. It now appears on your account, with its full logged service history, mileage, and documentation intact.</p>
      ${emailButton("Go to your dashboard", `${appUrl}/dashboard`)}
    `,
  });

  await resend.emails.send({
    from: FROM,
    to: params.requesterEmail,
    subject: `Your request for the ${safeBikeName}'s history was approved`,
    html,
  });
}

export async function sendOwnershipRequestDeclinedEmail(params: {
  requesterEmail: string;
  bikeSummary: { make: string; model: string; year?: number; isCustomBuild: boolean };
}) {
  const resend = getResend();
  const safeBikeName = escapeHtml(formatBikeName(params.bikeSummary));

  const html = renderEmailLayout({
    preheader: `Your request for the ${formatBikeName(params.bikeSummary)}'s history wasn't approved`,
    heading: `History request not approved`,
    bodyHtml: `
      <p style="margin:0 0 12px;">The current owner didn't approve your request for the <strong>${safeBikeName}</strong>'s RoadVerdict history.</p>
      <p style="margin:0;color:#54555A;font-size:13px;">If you believe this is a mistake, you're welcome to get in touch at <a href="mailto:hello@roadverdict.co.uk" style="color:#54555A;">hello@roadverdict.co.uk</a>.</p>
    `,
  });

  await resend.emails.send({
    from: FROM,
    to: params.requesterEmail,
    subject: `Your request for the ${safeBikeName}'s history wasn't approved`,
    html,
  });
}

// deleteAfterLabel is pre-formatted by the caller (userAccount.ts's
// requestAccountDeletion returns a raw ISO string; the API route turns
// that into a human date), same convention as expiresAtLabel elsewhere
// in this file - this function only ever renders it, never parses it.
export async function sendAccountDeletionRequestedEmail(email: string, deleteAfterLabel: string) {
  const resend = getResend();
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const html = renderEmailLayout({
    preheader: `Your account is scheduled for deletion on ${deleteAfterLabel}`,
    heading: "Your account is scheduled for deletion",
    bodyHtml: `
      <p style="margin:0 0 12px;">We've received a request to delete your RoadVerdict account. Nothing has been deleted yet - your account, and everything logged on it, will be permanently deleted on <strong>${escapeHtml(deleteAfterLabel)}</strong>, unless you cancel before then.</p>
      <p style="margin:0 0 12px;">Changed your mind, or didn't request this? Just sign in and click "Cancel deletion" on the banner at the top of your dashboard - nothing about your account changes in the meantime, you can keep using it as normal right up until the date above.</p>
      ${emailButton("Go to your dashboard", `${appUrl}/dashboard`)}
      <p style="margin:0;color:#54555A;font-size:13px;">After that date, this can't be undone.</p>
    `,
  });
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Your RoadVerdict account is scheduled for deletion",
    html,
  });
}

export async function sendAccountDeletedEmail(email: string) {
  const resend = getResend();
  const html = renderEmailLayout({
    preheader: "Your account has been permanently deleted",
    heading: "Your account has been deleted",
    bodyHtml: `
      <p style="margin:0 0 12px;">As requested, your RoadVerdict account and everything logged on it has now been permanently deleted. This can't be undone.</p>
      <p style="margin:0;color:#54555A;font-size:13px;">Didn't expect this? Get in touch straight away at <a href="mailto:hello@roadverdict.co.uk" style="color:#54555A;">hello@roadverdict.co.uk</a>.</p>
    `,
  });
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Your RoadVerdict account has been deleted",
    html,
  });
}

// fromEmail/message are both raw, user-supplied - never trust either as
// safe HTML, same rule escapeHtml's own comment states for buyerMessage
// above.
export async function sendFeedbackEmail(fromEmail: string, type: "feature" | "bug" | "other", message: string) {
  const resend = getResend();
  const typeLabel = type === "feature" ? "Feature request" : type === "bug" ? "Bug report" : "Feedback";
  const html = renderEmailLayout({
    preheader: `${typeLabel} from ${fromEmail}`,
    heading: typeLabel,
    bodyHtml: `
      <p style="margin:0 0 12px;">From: <strong>${escapeHtml(fromEmail)}</strong></p>
      <p style="margin:0;white-space:pre-wrap;">${escapeHtml(message)}</p>
    `,
  });
  await resend.emails.send({
    from: FROM,
    to: "hello@roadverdict.co.uk",
    replyTo: fromEmail,
    subject: `${typeLabel} - ${fromEmail}`,
    html,
  });
}
