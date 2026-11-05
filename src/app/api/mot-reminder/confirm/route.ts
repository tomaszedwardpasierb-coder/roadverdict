// Place at: src/app/api/mot-reminder/confirm/route.ts
//
// The link in the MOT reminder's confirmation email (?r=...&t=...). Opening
// it switches the reminder on, then shows the result on /mot-check/reminder.
import { NextRequest, NextResponse } from "next/server";
import { confirmMotReminder } from "@/lib/mot/motReminders";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const r = req.nextUrl.searchParams.get("r") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  let target = `${appUrl}/mot-check/reminder?status=invalid`;
  try {
    const result = await confirmMotReminder(r, t);
    if (result.ok) {
      target = `${appUrl}/mot-check/reminder?status=confirmed&vrm=${encodeURIComponent(result.registration)}&due=${encodeURIComponent(result.motDueDate)}`;
    }
  } catch (err) {
    console.error("MOT reminder confirmation failed:", err);
    target = `${appUrl}/mot-check/reminder?status=error`;
  }
  return NextResponse.redirect(target, 303);
}
