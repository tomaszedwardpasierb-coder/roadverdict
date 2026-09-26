// Place at: src/app/api/build-info/route.ts
//
// Answers with the commit this build was made from - read by the deploy
// workflow to know when the NEW app is the one actually answering
// requests. A version file in public/ (the first attempt) wasn't enough:
// it's read from disk, so the old app process served the new file for
// several minutes before Azure switched traffic to the new process.
// force-static bakes the answer into the build output, so each running
// process can only ever report its own build.
export const dynamic = 'force-static';

export function GET() {
  return new Response(process.env.BUILD_COMMIT ?? 'unknown', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
