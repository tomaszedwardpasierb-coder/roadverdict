// Place at: src/lib/push/sendPush.ts
//
// Sends a push notification to every phone an owner has the app signed in
// on, through Expo's push service (which hands Android ones to Google's
// FCM with the project's own credentials, kept on EAS). Best-effort by
// design: a push is a nudge, never the only record of anything, so a
// failure is logged and swallowed rather than breaking whatever sent it.
// A phone Expo says the app is no longer on has its token removed.
import { getPushTokens, removePushToken } from "@/lib/push/pushTokens";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const TIMEOUT_MS = 8000;

export type PushMessage = {
  title: string;
  body: string;
  // Where in the app a tap should go, e.g. "/reminders".
  url?: string;
  data?: Record<string, unknown>;
};

type Ticket = { status: "ok" | "error"; details?: { error?: string } };

export async function sendPushToUser(email: string, message: PushMessage): Promise<number> {
  let tokens: string[];
  try {
    tokens = await getPushTokens(email);
  } catch (err) {
    console.error("Push: couldn't read tokens:", err);
    return 0;
  }
  if (tokens.length === 0) return 0;

  const payload = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    sound: "default",
    channelId: "default",
    data: { ...message.data, ...(message.url ? { url: message.url } : {}) },
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("Push: Expo answered", res.status);
      return 0;
    }
    const tickets = ((await res.json()) as { data?: Ticket[] }).data ?? [];
    let sent = 0;
    await Promise.all(
      tickets.map(async (ticket, i) => {
        if (ticket.status === "ok") sent++;
        else if (ticket.details?.error === "DeviceNotRegistered") await removePushToken(email, tokens[i]);
      })
    );
    return sent;
  } catch (err) {
    console.error("Push: send failed:", err);
    return 0;
  }
}
