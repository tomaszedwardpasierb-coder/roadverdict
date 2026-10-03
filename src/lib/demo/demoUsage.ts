// Place at: src/lib/demo/demoUsage.ts
//
// Limits for the public sample-bike demo, which lets anyone read a receipt
// and ask a question with no account. Each of those costs real money (an
// AI call), so two ceilings apply per UK day: one per visitor's address,
// and one across the whole site, so a flood of bots or one viral video can
// never run up an unbounded bill. Counters are single documents bumped
// with an atomic increment (same pattern as the funnel counters) and expire
// on their own after two days. Nothing about the visitor is kept beyond a
// hash of the address inside the counter's id.
import { getContainer } from "@/lib/cosmos";
import { hashToken } from "@/lib/auth/crypto";

export type DemoUseKind = "scan" | "ask";

export const DEMO_LIMITS: Record<DemoUseKind, { perVisitor: number; wholeSite: number }> = {
  scan: { perVisitor: 5, wholeSite: 400 },
  ask: { perVisitor: 10, wholeSite: 1500 },
};

const PK = "demo-usage";
const TTL_SECONDS = 2 * 24 * 60 * 60;

function dayKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

type CounterDoc = { id: string; pk: string; type: "demoUsage"; count: number; ttl: number };

// Adds one and returns the new count.
async function bump(id: string): Promise<number> {
  const container = getContainer();
  const operations = [{ op: "incr" as const, path: "/count", value: 1 }];
  try {
    const { resource } = await container.item(id, PK).patch<CounterDoc>(operations);
    return resource?.count ?? 1;
  } catch (err) {
    if ((err as { code?: number }).code !== 404) throw err;
    try {
      await container.items.create({ id, pk: PK, type: "demoUsage", count: 1, ttl: TTL_SECONDS } satisfies CounterDoc);
      return 1;
    } catch (createErr) {
      if ((createErr as { code?: number }).code !== 409) throw createErr;
      const { resource } = await container.item(id, PK).patch<CounterDoc>(operations);
      return resource?.count ?? 1;
    }
  }
}

export type DemoUseResult = "ok" | "visitor_limit" | "site_limit";

export async function takeDemoUse(kind: DemoUseKind, ip: string, limits = DEMO_LIMITS[kind]): Promise<DemoUseResult> {
  const day = dayKey();
  const visitorCount = await bump(`demo-usage::${kind}::${day}::ip::${hashToken(ip)}`);
  if (visitorCount > limits.perVisitor) return "visitor_limit";
  const siteCount = await bump(`demo-usage::${kind}::${day}::site`);
  if (siteCount > limits.wholeSite) return "site_limit";
  return "ok";
}

export function demoEnabled(): boolean {
  return process.env.DEMO_ENABLED !== "false";
}

export const DEMO_MESSAGES = {
  visitor_limit: "You've used today's free samples. Create a free account to scan as many receipts as you like.",
  site_limit: "The demo is very busy right now - please try again tomorrow, or create a free account to use the real thing.",
  disabled: "The demo is switched off at the moment. Create a free account to try RoadVerdict.",
} as const;
