// Place at: src/app/api/app/push-token/route.ts
//
// The Android app registers the phone it's signed in on for push
// notifications (POST), and removes it on sign-out (DELETE). Only ever
// for the signed-in account; see lib/push/pushTokens.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isExpoPushToken, removePushToken, savePushToken } from "@/lib/push/pushTokens";

export const dynamic = "force-dynamic";

async function readToken(request: NextRequest): Promise<{ token: string; deviceName: string } | null> {
  try {
    const body = (await request.json()) as { token?: unknown; deviceName?: unknown };
    if (typeof body.token !== "string" || !isExpoPushToken(body.token)) return null;
    return { token: body.token, deviceName: typeof body.deviceName === "string" ? body.deviceName : "" };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const input = await readToken(request);
  if (!input) return NextResponse.json({ error: "A valid push token is required." }, { status: 400 });
  await savePushToken(session.email, input.token, input.deviceName);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const input = await readToken(request);
  if (!input) return NextResponse.json({ error: "A valid push token is required." }, { status: 400 });
  await removePushToken(session.email, input.token);
  return NextResponse.json({ ok: true });
}
