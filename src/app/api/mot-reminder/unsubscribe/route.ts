// Place at: src/app/api/mot-reminder/unsubscribe/route.ts
//
// Stops an MOT reminder. Two callers: the button on /mot-check/reminder
// (a plain form post, sent back to that page), and an email client's own
// "Unsubscribe" button, which posts "List-Unsubscribe=One-Click" to the
// address in the reminder's List-Unsubscribe header and only needs a 200.
// Only a POST stops reminders - a link checker opening the email's links
// must never unsubscribe anyone.
import { NextRequest, NextResponse } from "next/server";
import { unsubscribeMotReminder } from "@/lib/mot/motReminders";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  let r = req.nextUrl.searchParams.get("r") ?? "";
  let t = req.nextUrl.searchParams.get("t") ?? "";
  let oneClick = false;
  try {
    const form = await req.formData();
    oneClick = form.get("List-Unsubscribe") === "One-Click";
    r = typeof form.get("r") === "string" ? (form.get("r") as string) : r;
    t = typeof form.get("t") === "string" ? (form.get("t") as string) : t;
  } catch {
    // No form body: the link's own r and t are used.
  }

  let ok = false;
  try {
    ok = await unsubscribeMotReminder(r, t);
  } catch (err) {
    console.error("MOT reminder unsubscribe failed:", err);
    if (oneClick) return new NextResponse(null, { status: 500 });
    return NextResponse.redirect(`${appUrl}/mot-check/reminder?status=error`, 303);
  }
  if (oneClick) return new NextResponse(null, { status: ok ? 200 : 400 });
  return NextResponse.redirect(`${appUrl}/mot-check/reminder?status=${ok ? "unsubscribed" : "invalid"}`, 303);
}
