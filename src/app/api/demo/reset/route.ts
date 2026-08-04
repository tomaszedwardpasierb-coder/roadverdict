// Place at: src/app/api/demo/reset/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { DEMO_EMAIL } from "@/lib/tracker/demoSeed";
import { runDemoSeed } from "@/lib/tracker/demoSeedRunner";

export const dynamic = "force-dynamic";

// Hardcoded to the exact demo account only - even if this route were
// somehow called while signed in as a different account, it refuses
// outright rather than touching anything real. Nobody else's data can
// ever be reachable through this endpoint, regardless of what a request
// claims.
export async function POST() {
  const session = await getSession();
  if (!session || session.email !== DEMO_EMAIL) {
    return NextResponse.json({ error: "Not the demo account." }, { status: 403 });
  }

  try {
    const counts = await runDemoSeed();
    return NextResponse.json({ ok: true, counts });
  } catch {
    return NextResponse.json({ error: "Could not reset the demo account." }, { status: 500 });
  }
}
