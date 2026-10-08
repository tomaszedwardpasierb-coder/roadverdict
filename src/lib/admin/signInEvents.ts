// Place at: src/lib/admin/signInEvents.ts
//
// A small, durable record of the Android app's sign-in codes, so /tomasz can
// show "codes requested vs entered" and catch emails that never arrive. The
// codes themselves (auth/appLoginCode.ts) are deleted after ten minutes, so
// without this there is nothing to look back on - and the email service's
// "send" result used to be thrown away.
//
// One tiny document per event, grouped by UK day so "the last 24 hours" is two
// single-partition reads, and kept for 30 days. Like quoteLogs.ts it only
// writes on Azure (a local test sign-in must not show up in the live numbers),
// it is never awaited by a request, and it never throws: bookkeeping can't
// slow down or break a sign-in.
import { randomUUID } from "crypto";
import { getContainer } from "@/lib/cosmos";
import { APP_CODE_TTL_SECONDS } from "@/lib/auth/appLoginCode";
import { ukDay } from "@/lib/admin/userActivity";

export type SignInEventKind = "requested" | "entered" | "wrong" | "expired";

export interface SignInEventDoc {
  id: string;
  pk: string;
  type: "signInEvent";
  kind: SignInEventKind;
  email: string;
  // "requested" only: did the email service accept the message? Absent on the
  // other kinds.
  sentOk?: boolean;
  createdAt: string;
  ttl: number;
}

export type SignInEvent = Pick<SignInEventDoc, "kind" | "email" | "createdAt" | "sentOk">;

const TTL_SECONDS = 30 * 24 * 60 * 60;
const HOUR_MS = 60 * 60 * 1000;
const CODE_LIFETIME_MS = APP_CODE_TTL_SECONDS * 1000;

export function signInEventPk(day: string): string {
  return `signInEvent::${day}`;
}

export async function logSignInEvent(
  kind: SignInEventKind,
  email: string,
  extra: { sentOk?: boolean } = {},
  now: Date = new Date()
): Promise<void> {
  if (!process.env.WEBSITE_SITE_NAME) return;
  try {
    const doc: SignInEventDoc = {
      id: `signInEvent::${randomUUID()}`,
      pk: signInEventPk(ukDay(now)),
      type: "signInEvent",
      kind,
      email,
      ...(extra.sentOk === undefined ? {} : { sentOk: extra.sentOk }),
      createdAt: now.toISOString(),
      ttl: TTL_SECONDS,
    };
    await getContainer().items.create(doc);
  } catch {
    // Never let bookkeeping fail a sign-in.
  }
}

export interface StuckSignIn {
  email: string;
  requestedAt: string;
  minutesAgo: number;
  // The email service refused the message outright.
  sendFailed: boolean;
  // Wrong or expired codes typed since this request.
  failedTries: number;
  // Asked less than a code's lifetime ago: still has time to arrive, not yet a problem.
  stillValid: boolean;
}

export interface SignInHealth {
  windowHours: number;
  requested: number;
  entered: number;
  wrong: number;
  expired: number;
  sendFailed: number;
  people: number;
  signedIn: number;
  stuck: StuckSignIn[];
  // problem: an email was refused; watch: someone asked and never got in;
  // ok: everyone who asked got in (or is still within the code's ten minutes).
  status: "ok" | "watch" | "problem";
}

// Pure, so the rules can be tested without a database: group events by email,
// and call a person "stuck" when their latest request has no successful entry
// after it.
export function summariseSignInHealth(events: SignInEvent[], now: Date = new Date(), windowHours = 24): SignInHealth {
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const health: SignInHealth = {
    windowHours,
    requested: 0,
    entered: 0,
    wrong: 0,
    expired: 0,
    sendFailed: 0,
    people: 0,
    signedIn: 0,
    stuck: [],
    status: "ok",
  };
  const requesters = new Set<string>();
  const entrants = new Set<string>();
  const lastRequest = new Map<string, SignInEvent>();
  const lastEntered = new Map<string, string>();

  for (const e of sorted) {
    if (e.kind === "requested") {
      health.requested++;
      requesters.add(e.email);
      lastRequest.set(e.email, e);
      if (e.sentOk === false) health.sendFailed++;
    } else if (e.kind === "entered") {
      health.entered++;
      entrants.add(e.email);
      lastEntered.set(e.email, e.createdAt);
    } else if (e.kind === "wrong") {
      health.wrong++;
    } else if (e.kind === "expired") {
      health.expired++;
    }
  }
  health.people = requesters.size;
  health.signedIn = entrants.size;

  for (const [email, request] of lastRequest) {
    const entered = lastEntered.get(email);
    if (entered && entered >= request.createdAt) continue;
    const age = now.getTime() - new Date(request.createdAt).getTime();
    health.stuck.push({
      email,
      requestedAt: request.createdAt,
      minutesAgo: Math.max(0, Math.round(age / 60000)),
      sendFailed: request.sentOk === false,
      failedTries: sorted.filter((e) => e.email === email && (e.kind === "wrong" || e.kind === "expired") && e.createdAt >= request.createdAt).length,
      stillValid: age < CODE_LIFETIME_MS,
    });
  }
  health.stuck.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  if (health.stuck.some((s) => s.sendFailed)) health.status = "problem";
  else if (health.stuck.some((s) => !s.stillValid)) health.status = "watch";
  return health;
}

// The last 24 hours of events, from today's and yesterday's partitions. Returns
// null (not zeros) when the read fails, so /tomasz says "couldn't load" instead
// of showing a reassuring empty picture.
export async function getSignInHealth(now: Date = new Date(), windowHours = 24): Promise<SignInHealth | null> {
  try {
    const since = new Date(now.getTime() - windowHours * HOUR_MS);
    const partitions = [...new Set([ukDay(since), ukDay(now)])].map(signInEventPk);
    const container = getContainer();
    const batches = await Promise.all(
      partitions.map(async (pk) => {
        const { resources } = await container.items
          .query<SignInEvent>(
            {
              query: "SELECT c.kind, c.email, c.sentOk, c.createdAt FROM c WHERE c.type = 'signInEvent' AND c.createdAt >= @since",
              parameters: [{ name: "@since", value: since.toISOString() }],
            },
            { partitionKey: pk }
          )
          .fetchAll();
        return resources;
      })
    );
    return summariseSignInHealth(batches.flat(), now, windowHours);
  } catch {
    return null;
  }
}
