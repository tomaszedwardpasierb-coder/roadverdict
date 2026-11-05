// Place at: src/app/api/mot-reminder/route.ts
//
// The "email me before this MOT is due" form on the free MOT check result
// (see lib/mot/motReminders.ts). No account: the reminder only starts once
// the address's owner confirms it from the email this sends.
import { NextRequest, NextResponse } from "next/server";
import { isLikelyBot } from "@/lib/analytics/funnel";
import { visitorAddress } from "@/lib/mot/motCheckUsage";
import { requestMotReminder } from "@/lib/mot/motReminders";

export const dynamic = "force-dynamic";

const MESSAGES = {
  invalid_email: "That email address doesn’t look right. Check it and try again.",
  invalid_registration: "That registration doesn’t look right. Check it and try again.",
  no_due_date: "We can’t set a reminder for this vehicle: its MOT record doesn’t show an upcoming due date.",
  limit: "Too many reminder requests today. Please try again tomorrow.",
  unavailable: "Reminders aren’t available right now. Please try again in a few minutes.",
} as const;

export async function POST(req: NextRequest) {
  let body: { email?: unknown; registration?: unknown; website?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: MESSAGES.invalid_email }, { status: 400 });
  }

  // A hidden field people never see: anything typed in it is a form-filling
  // bot, which gets the usual reply and nothing sent.
  if ((typeof body.website === "string" && body.website !== "") || isLikelyBot(req.headers.get("user-agent"))) {
    return NextResponse.json({ ok: true, status: "sent" });
  }

  try {
    const result = await requestMotReminder({
      email: body.email,
      registration: body.registration,
      ip: visitorAddress(req.headers.get("x-forwarded-for")),
      appUrl: process.env.APP_URL ?? "https://roadverdict.co.uk",
    });
    if (result.status === "sent" || result.status === "already") {
      return NextResponse.json({ ok: true, status: result.status, motDueDate: result.motDueDate });
    }
    return NextResponse.json({ error: MESSAGES[result.status] }, { status: result.status === "limit" ? 429 : 400 });
  } catch (err) {
    console.error("MOT reminder request failed:", err);
    return NextResponse.json({ error: MESSAGES.unavailable }, { status: 500 });
  }
}
