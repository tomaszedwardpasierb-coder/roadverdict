// Place at: src/app/api/tomasz/assistant-config/auto-enable-onboarding/route.ts
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { updateAutoEnableOnboarding } from "@/lib/tracker/assistantConfig";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    await updateAutoEnableOnboarding(body.enabled);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to update onboarding auto-enable setting:", err);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}
