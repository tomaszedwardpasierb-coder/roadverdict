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
      <p>Your reminder for <strong>${reminderName}</strong> is now due - ${detail}.</p>
      <p>Sign in to your <a href="${appUrl}/dashboard">RoadVerdict dashboard</a> to log it and reset this reminder.</p>
    `,
  });
}
export async function sendShareLinkEmail(toEmail: string, bikeName: string, reportUrl: string, expiresAtLabel: string) {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Ownership report for ${bikeName}`,
    html: `
      <p>Hi,</p>
      <p>You've been sent a RoadVerdict ownership report for <strong>${bikeName}</strong> - a logged history of service,
      modifications, and bills, shared by the seller.</p>
      <p><a href="${reportUrl}">View the report</a></p>
      <p>This link is valid until ${expiresAtLabel}, after which it will be permanently deleted.</p>
    `,
  });
}
