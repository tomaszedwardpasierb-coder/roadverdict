// Place at: src/lib/tracker/pendingScanBatch.ts
import { getContainer } from "@/lib/cosmos";
import type { TrackerDocBase } from "@/lib/tracker/cosmosHelpers";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";

// What lets a batch scan survive the owner navigating away or closing
// the tab mid-review. Previously, everything the queue hadn't yet
// reached only ever existed in browser memory - close the tab, and it
// was gone for good, with no way to tell the owner had even started.
// This document holds exactly the items still waiting to be reviewed;
// each time the queue commits one, it's rewritten without that item,
// and deleted outright once the batch is fully done.
export interface PendingScanBatchDoc extends TrackerDocBase {
  type: "pendingScanBatch";
  items: ParsedReceiptItem[];
}

// Deterministic, not timestamp-based like other doc types - there's
// only ever meant to be one pending batch per bike at a time, so a
// fixed id means "save a new batch for this bike" naturally replaces
// whatever was there before, and "is there one already" is a plain
// point-read rather than a query.
function pendingBatchId(email: string, bikeId: string): string {
  return `${email}::pendingScanBatch::${bikeId}`;
}

export async function getPendingScanBatch(email: string, bikeId: string): Promise<PendingScanBatchDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(pendingBatchId(email, bikeId), email).read<PendingScanBatchDoc>();
  return resource ?? null;
}

// Upsert, not create - called both when a fresh scan finishes parsing
// (items.length === parsedItems.length) and every time the review
// queue commits one of them (items shrinks by one). An empty items
// array is never written; the caller deletes instead, so a stale,
// empty batch document never lingers.
export async function savePendingScanBatch(email: string, bikeId: string, items: ParsedReceiptItem[]): Promise<PendingScanBatchDoc> {
  const container = getContainer();
  const existing = await getPendingScanBatch(email, bikeId);
  const doc: PendingScanBatchDoc = {
    id: pendingBatchId(email, bikeId),
    pk: email,
    type: "pendingScanBatch",
    bikeId,
    date: existing?.date ?? new Date().toISOString(),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    items,
  };
  await container.items.upsert(doc);
  return doc;
}

export async function deletePendingScanBatch(email: string, bikeId: string): Promise<void> {
  const container = getContainer();
  try {
    await container.item(pendingBatchId(email, bikeId), email).delete();
  } catch {
    // Already gone (e.g. the batch finished normally and this is a
    // redundant cleanup call) - not an error worth surfacing.
  }
}
