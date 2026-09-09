// Place at: src/lib/admin/impersonation.ts
import { cookies } from "next/headers";
import { getContainer } from "@/lib/cosmos";

const ADMIN_PK = "admin";

// Checks for real evidence this account has actually been used, rather
// than trusting the newer `type: "user"` marker doc alone - that doc is
// only reliably created going forward (createSessionForEmail only makes
// one on a login that finds nothing existing yet), so it's absent for
// every account that was already active before that code shipped. A
// session doc (a real completed login) or a bike doc (real usage) are
// both signals that predate that convention and cover every real account.
export async function userExists(email: string): Promise<boolean> {
  const container = getContainer();
  try {
    const { resources } = await container.items
      .query({
        query:
          "SELECT VALUE COUNT(1) FROM c WHERE c.pk = @email AND (c.type = 'user' OR c.type = 'session' OR c.type = 'bike')",
        parameters: [{ name: "@email", value: email }],
      })
      .fetchAll();
    return (resources[0] ?? 0) > 0;
  } catch {
    return false;
  }
}

// Generates the id a session's "start" event should use - both the
// caller (the impersonate route) and any correlated "end" event need to
// agree on this same value, so it's a real sessionId parameter rather
// than something derived internally each call.
export function newImpersonationSessionId(): string {
  return `impersonation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// reason is only ever meaningful on a "start" event - the admin gives
// their reason once, at the point they start impersonating, not again
// when they exit. sessionId is what lets a "start" and its eventual
// "end" be paired up later (see getAllImpersonationSessions below) to
// compute a real duration, rather than just showing a flat list of
// disconnected events.
export async function logImpersonation(
  targetEmail: string,
  ip: string,
  action: "start" | "end",
  sessionId: string,
  reason?: string
): Promise<void> {
  const container = getContainer();
  // Deterministic id (sessionId + action) rather than a random suffix -
  // makes this idempotent (e.g. a double-click on "Exit impersonation"
  // safely upserts the same "end" doc again) rather than throwing a
  // Cosmos conflict on a genuine duplicate call.
  await container.items.upsert({
    id: `${sessionId}::${action}`,
    pk: ADMIN_PK,
    type: "adminImpersonation",
    targetEmail,
    action,
    sessionId,
    ...(reason ? { reason } : {}),
    at: new Date().toISOString(),
    ip,
  });
}

export interface ImpersonationSession {
  sessionId: string;
  targetEmail: string;
  reason: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  ip: string;
}

// One row per sessionId, newest first - pairs each "start" event with
// its "end" event (if any) rather than just listing raw start/end
// events separately, since "how long did this actually last" is the
// question an admin reviewing this log will actually have.
export async function getAllImpersonationSessions(): Promise<ImpersonationSession[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ sessionId: string; targetEmail: string; action: "start" | "end"; at: string; ip: string; reason?: string }>(
      { query: "SELECT * FROM c WHERE c.type = 'adminImpersonation'" },
      { partitionKey: ADMIN_PK }
    )
    .fetchAll();

  const bySessionId = new Map<string, { start?: typeof resources[number]; end?: typeof resources[number] }>();
  for (const doc of resources) {
    const entry = bySessionId.get(doc.sessionId) ?? {};
    if (doc.action === "start") entry.start = doc;
    else entry.end = doc;
    bySessionId.set(doc.sessionId, entry);
  }

  const sessions: ImpersonationSession[] = [];
  for (const [sessionId, { start, end }] of bySessionId) {
    if (!start) continue; // an "end" with no matching "start" is nothing a real admin session ever produced
    const durationMinutes = end ? Math.round((new Date(end.at).getTime() - new Date(start.at).getTime()) / 60000) : null;
    sessions.push({
      sessionId,
      targetEmail: start.targetEmail,
      reason: start.reason ?? null,
      startedAt: start.at,
      endedAt: end?.at ?? null,
      durationMinutes,
      ip: start.ip,
    });
  }
  return sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export interface ImpersonationActivityEntry {
  sessionId: string;
  targetEmail: string;
  docType: string;
  docId: string;
  action: "create" | "update" | "delete";
  at: string;
}

// Best-effort, fire-and-forget - called from cosmosHelpers.ts's shared
// write functions, never from a route directly. A logging failure here
// must never block or fail the real write it's describing, so this
// swallows its own errors rather than letting a caller's try/catch
// (which may not exist) be the only thing standing between a logging
// hiccup and a broken save.
export async function logImpersonationActivity(entry: ImpersonationActivityEntry): Promise<void> {
  try {
    const container = getContainer();
    await container.items.create({
      id: `impersonation-activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pk: ADMIN_PK,
      type: "impersonationActivity",
      ...entry,
    });
  } catch (err) {
    console.error("logImpersonationActivity: failed to write activity log entry (the real write itself still succeeded):", err);
  }
}

// Called directly from the specific API routes that write genuine
// account data (bike/car fields, reminders, share links, receipt-
// request decisions - see each route's own call site) rather than from
// a single shared data-layer choke point. That was tried first (see
// git history) and patched cosmos.ts's own container singleton so every
// write anywhere would be seen automatically - but cosmos.ts turns out
// to be transitively reachable from a client component (ProGate.tsx ->
// subscriptions.ts -> userDoc.ts -> cosmos.ts, since subscriptions.ts
// exports a real constant a client component needs), and importing
// next/headers there broke the production build outright (Next.js
// refuses to bundle it for the client). Route Handlers, unlike shared
// lib files, are guaranteed server-only by Next.js's own architecture,
// so calling this from each one individually is the safe boundary -
// more call sites to maintain, but zero risk of silently breaking the
// client bundle again. Deliberately does NOT gate on the doc's own
// partition key matching the impersonated account - by the time a
// route handler is running, session.email (from getSession()) already
// IS the impersonated account's own email, so there's nothing further
// to check here beyond "is an impersonation session active at all."
export async function logImpersonationActivityForCurrentRequest(
  docType: string,
  docId: string,
  action: "create" | "update" | "delete"
): Promise<void> {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("impersonation_session_id")?.value;
    const targetEmail = cookieStore.get("impersonating_as")?.value;
    if (!sessionId || !targetEmail) return;
    await logImpersonationActivity({ sessionId, targetEmail, docType, docId, action, at: new Date().toISOString() });
  } catch (err) {
    console.error("logImpersonationActivityForCurrentRequest: failed (the real write itself still succeeded):", err);
  }
}

// Count of tracked changes for one impersonation session - "tracked"
// meaning only the specific routes that call
// logImpersonationActivityForCurrentRequest above (see that function's
// own comment for which ones, and why this is a real, honest subset
// rather than every write in the app).
export async function countImpersonationActivity(sessionId: string): Promise<number> {
  const container = getContainer();
  const { resources } = await container.items
    .query<number>(
      {
        query: "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'impersonationActivity' AND c.sessionId = @sessionId",
        parameters: [{ name: "@sessionId", value: sessionId }],
      },
      { partitionKey: ADMIN_PK }
    )
    .fetchAll();
  return resources[0] ?? 0;
}

const IMPERSONATION_LOG_RETENTION_DAYS = 365;

// No Cosmos ttl here on purpose - unlike the app's other short-lived
// docs, this is an audit trail meant to support a later fraud/incident
// review, so it should outlive a normal session by a long way rather
// than silently expire on a fixed short clock. A year is a standard
// audit-log retention floor, not a technical necessity.
// Same retention/audit reasoning as adminImpersonation itself covers
// both doc types this function now purges - impersonationActivity is
// just as much a part of the audit trail as the start/end events it's
// correlated with, and should age out on the same schedule, not linger
// after its parent session's own log entries are gone.
export async function purgeOldImpersonationLogs(): Promise<number> {
  const container = getContainer();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - IMPERSONATION_LOG_RETENTION_DAYS);
  const { resources } = await container.items
    .query<{ id: string }>(
      {
        query: "SELECT c.id FROM c WHERE (c.type = 'adminImpersonation' OR c.type = 'impersonationActivity') AND c.at < @cutoff",
        parameters: [{ name: "@cutoff", value: cutoff.toISOString() }],
      },
      { partitionKey: ADMIN_PK }
    )
    .fetchAll();
  const results = await Promise.allSettled(resources.map((r) => container.item(r.id, ADMIN_PK).delete()));
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(`purgeOldImpersonationLogs: ${failures.length} of ${resources.length} failed to delete:`, failures);
  }
  return results.filter((r) => r.status === "fulfilled").length;
}
