// Place at: src/app/api/rum/tab-switch/route.ts
//
// Receives DashboardShell.tsx's click-to-visible timing (see its own
// `reportTabSwitchTiming` comment) and forwards it to Application
// Insights via lib/telemetry/rum.ts - see that file's own comment on why
// this exists (DASHBOARD_LATENCY_HANDOVER.md's "Planned next steps" #1).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { trackTabSwitchTiming } from "@/lib/telemetry/rum";

export const dynamic = "force-dynamic";

// A background/suspended tab can report a huge or even negative delta
// (the browser paused its timers mid-measurement) - dropped rather than
// forwarded, so a single suspended tab can't skew the real metric.
const MAX_PLAUSIBLE_DURATION_MS = 60_000;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    // sendBeacon (the normal path here - see DashboardShell.tsx) posts a
    // Blob with no guaranteed Content-Type, so this reads the raw text
    // and parses it itself rather than relying on request.json()'s
    // Content-Type sniffing.
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { tab, durationMs, firstVisit } = (body ?? {}) as { tab?: unknown; durationMs?: unknown; firstVisit?: unknown };
  if (typeof tab !== "string" || !tab || typeof durationMs !== "number" || !Number.isFinite(durationMs) || typeof firstVisit !== "boolean") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (durationMs >= 0 && durationMs <= MAX_PLAUSIBLE_DURATION_MS) {
    trackTabSwitchTiming({ tab, durationMs, firstVisit });
  }

  return NextResponse.json({ ok: true });
}
