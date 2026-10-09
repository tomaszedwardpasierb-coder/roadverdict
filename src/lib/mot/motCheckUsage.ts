// Place at: src/lib/mot/motCheckUsage.ts
//
// Who can use the free MOT check, and how much. While the MOT data comes
// from Vehicle Data Global, every new plate is a paid lookup, so two
// ceilings apply per UK day, the same way as the sample-bike demo
// (demoUsage.ts): checks per visitor's address, and new (uncached)
// lookups across the whole site. Counters are single documents bumped
// atomically and expire on their own after two days; the only trace of a
// visitor is a hash of their address inside the counter's id.
import { getContainer } from "@/lib/cosmos";
import { hashToken } from "@/lib/auth/crypto";

// "off": the page doesn't exist. "admin": only a signed-in admin sees it
// (for checking real records on the live site). "public": everyone.
export type MotCheckMode = "off" | "admin" | "public";

export function motCheckMode(): MotCheckMode {
  const v = process.env.MOT_CHECK_MODE;
  return v === "off" || v === "public" ? v : "admin";
}

export const MOT_CHECK_LIMITS = {
  // Checks per visitor per day, cached or not.
  perVisitor: Number(process.env.MOT_CHECK_PER_VISITOR) || 20,
  // New paid lookups across the whole site per day.
  newLookupsSiteWide: Number(process.env.MOT_CHECK_DAILY_NEW_LOOKUPS) || 150,
};

const PK = "mot-check-usage";
const TTL_SECONDS = 2 * 24 * 60 * 60;

function dayKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

type CounterDoc = { id: string; pk: string; type: "motCheckUsage"; count: number; ttl: number };

async function bump(id: string): Promise<number> {
  const container = getContainer();
  const operations = [{ op: "incr" as const, path: "/count", value: 1 }];
  try {
    const { resource } = await container.item(id, PK).patch<CounterDoc>(operations);
    return resource?.count ?? 1;
  } catch (err) {
    if ((err as { code?: number }).code !== 404) throw err;
    try {
      await container.items.create({ id, pk: PK, type: "motCheckUsage", count: 1, ttl: TTL_SECONDS } satisfies CounterDoc);
      return 1;
    } catch (createErr) {
      if ((createErr as { code?: number }).code !== 409) throw createErr;
      const { resource } = await container.item(id, PK).patch<CounterDoc>(operations);
      return resource?.count ?? 1;
    }
  }
}

export type MotCheckAllowance = "ok" | "visitor_limit" | "site_limit";

// Counts one check for this visitor.
export async function takeVisitorCheck(ip: string, limit = MOT_CHECK_LIMITS.perVisitor): Promise<MotCheckAllowance> {
  const count = await bump(`mot-check::${dayKey()}::ip::${hashToken(ip)}`);
  return count > limit ? "visitor_limit" : "ok";
}

// Counts one new paid lookup across the site.
export async function takeNewLookup(limit = MOT_CHECK_LIMITS.newLookupsSiteWide): Promise<MotCheckAllowance> {
  const count = await bump(`mot-check::${dayKey()}::site`);
  return count > limit ? "site_limit" : "ok";
}

export const MOT_CHECK_MESSAGES = {
  visitor_limit: "You’ve used today’s free MOT checks. You can check again tomorrow - or add your own vehicle to a free logbook to keep its MOT history and reminders.",
  site_limit: "Free MOT checks are very busy today, so we can only show plates someone has already checked. Please try again tomorrow. You can always see any vehicle’s MOT history on GOV.UK.",
} as const;
