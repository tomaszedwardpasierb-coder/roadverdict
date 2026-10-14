// Place at: src/app/health/route.ts
//
// Answers 200 with no work at all (no database, no session): this is the
// address Azure's health check pings every ~30 seconds. Until this
// existed every ping got a 404, which counted as ~1,500 failed requests a
// day and could make Azure treat a perfectly healthy app as unhealthy.
// force-static bakes the answer into the build, so a ping can never queue
// behind real work.
export const dynamic = 'force-static';

export function GET() {
  return new Response('ok', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
