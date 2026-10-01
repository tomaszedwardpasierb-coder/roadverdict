// Place at: src/app/api/app/push-test/route.ts
//
// "Send me a test notification" from the app's Settings: a push to the
// signed-in owner's own phones only, saying how many phones are registered
// and how many Expo accepted - so the app can tell "this phone never
// registered" apart from "registered, but the send failed".
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPushTokens } from "@/lib/push/pushTokens";
import { sendPushToUser } from "@/lib/push/sendPush";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const registered = (await getPushTokens(session.email)).length;
  const sent = registered
    ? await sendPushToUser(session.email, {
        title: "RoadVerdict test",
        body: "Notifications are working on this phone.",
        url: "/notifications",
      })
    : 0;
  return NextResponse.json({ registered, sent });
}
