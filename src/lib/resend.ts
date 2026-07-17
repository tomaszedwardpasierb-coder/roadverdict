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
