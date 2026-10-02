// Place at: src/app/api/funnel/route.ts
//
// The browser's half of the sign-up funnel (see lib/analytics/funnel.ts):
// only the two page steps - the home page and the sign-in page - come from
// here. Every later step is counted on the server where it happens, so it
// can't be faked from a browser. Anonymous counts only.
import { NextRequest, NextResponse } from "next/server";
import { recordFunnelStep, toFunnelSource, isInAppBrowser, isLikelyBot } from "@/lib/analytics/funnel";

export const dynamic = "force-dynamic";

const PAGE_STEPS = new Set(["home", "login"]);

export async function POST(req: NextRequest) {
  const userAgent = req.headers.get("user-agent");
  let body: unknown = null;
  try {
    body = JSON.parse(await req.text());
  } catch {
    // sendBeacon posts text/plain; a bad body is just ignored.
  }
  const { step, source } = (body ?? {}) as { step?: unknown; source?: unknown };
  if (typeof step === "string" && PAGE_STEPS.has(step) && !isLikelyBot(userAgent)) {
    await recordFunnelStep(step as "home" | "login", { source: toFunnelSource(source) ?? "other", inApp: isInAppBrowser(userAgent) });
  }
  return new NextResponse(null, { status: 204 });
}
