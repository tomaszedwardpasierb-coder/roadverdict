// Place at: src/lib/admin/receiptScanLog.ts
//
// A tiny record of each successful receipt scan - who, when and how many items
// the AI read, never the photo or what was on it - so /tomasz can show how
// many receipts the testers scanned (the production-access form asks for real
// usage). Nothing recorded one before: the Gemini usage log is anonymous, and
// scanned items are saved as ordinary entries with no marker.
//
// One small document per scan in the account's own partition, kept for 90
// days. Like quoteLogs.ts it only writes on Azure, is never awaited by the
// request, and never throws.
import { randomUUID } from "crypto";
import { getContainer } from "@/lib/cosmos";

export interface ReceiptScanDoc {
  id: string;
  pk: string;
  type: "receiptScan";
  email: string;
  items: number;
  createdAt: string;
  ttl: number;
}

const TTL_SECONDS = 90 * 24 * 60 * 60;

export async function logReceiptScan(email: string, items: number, now: Date = new Date()): Promise<void> {
  if (!process.env.WEBSITE_SITE_NAME) return;
  try {
    const doc: ReceiptScanDoc = {
      id: `receiptScan::${randomUUID()}`,
      pk: email,
      type: "receiptScan",
      email,
      items,
      createdAt: now.toISOString(),
      ttl: TTL_SECONDS,
    };
    await getContainer().items.create(doc);
  } catch {
    // Never let bookkeeping fail a scan.
  }
}

export interface ReceiptScanCounts {
  byEmail: Map<string, number>;
  // The earliest scan on record, so the page can say "counted from ...": scans
  // before this recording existed can't be known.
  firstAt: string | null;
}

// Scans since a date, per account. Null when the read fails.
export async function getReceiptScanCounts(since: Date): Promise<ReceiptScanCounts | null> {
  try {
    const { resources } = await getContainer()
      .items.query<{ pk: string; createdAt: string }>({
        query: "SELECT c.pk, c.createdAt FROM c WHERE c.type = 'receiptScan' AND c.createdAt >= @since",
        parameters: [{ name: "@since", value: since.toISOString() }],
      })
      .fetchAll();
    const byEmail = new Map<string, number>();
    let firstAt: string | null = null;
    for (const r of resources) {
      byEmail.set(r.pk, (byEmail.get(r.pk) ?? 0) + 1);
      if (firstAt === null || r.createdAt < firstAt) firstAt = r.createdAt;
    }
    return { byEmail, firstAt };
  } catch {
    return null;
  }
}
