// Place at: src/lib/tracker/atomicUpdate.ts
//
// A real concurrency guard for the "read a cooldown/cap field, do some
// real work, then separately record that it happened" shape repeated
// across this app (Pro's free Buying Guide report, the valuation-check
// cooldown, the free lookup cap, both assistant message caps, the
// combined vehicle cap, the Vault's document/size caps). Every one of
// those was a plain read-then-upsert with no Cosmos ETag precondition,
// so two concurrent requests could both pass the same check before
// either write landed - a lost-update race, not just a rare edge case.
//
// The fix used throughout: capture the document's _etag at check time
// (getDocWithEtag), do the real work, then write the "I used this"
// record conditioned on that exact etag (replaceIfUnchanged). If a
// concurrent writer already changed the document, the conditional write
// fails with HTTP 412 - re-read the fresh document and re-run the
// caller's own predicate against it: if the fresh state shows the same
// cooldown/cap was already consumed by the other writer, this correctly
// reports a loss rather than granting a second free run; if the 412 was
// just an unrelated field changing concurrently (e.g. displayName), this
// retries once against the fresh etag rather than incorrectly rejecting.
import { getContainer } from "@/lib/cosmos";

export interface DocWithEtag<T> {
  doc: T;
  // Cosmos always stamps a real, persisted document with this system
  // property - it's only ever absent on a doc that doesn't exist, which
  // getDocWithEtag already returns null for instead.
  etag: string;
}

export async function getDocWithEtag<T extends { id: string; pk: string }>(id: string, pk: string): Promise<DocWithEtag<T> | null> {
  const container = getContainer();
  const { resource } = await container.item(id, pk).read<T & { _etag?: string }>();
  if (!resource || !resource._etag) return null;
  return { doc: resource, etag: resource._etag };
}

function isPreconditionFailed(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  return code === 412 || statusCode === 412;
}

export type ReplaceIfUnchangedResult<T> =
  | { ok: true }
  | { ok: false; reason: "rejected"; latest: T }
  | { ok: false; reason: "not_found" };

// Writes `applyChange(baseDoc)` conditioned on the document not having
// changed since `etag` was captured. `stillAllowed` is re-run against
// the freshest document on a conflict, so the caller's own "is this
// still within the cooldown/cap" logic - not a generic retry - decides
// whether the loss is genuine or just an unrelated collision.
export async function replaceIfUnchanged<T extends { id: string; pk: string }>(
  id: string,
  pk: string,
  etag: string,
  baseDoc: T,
  applyChange: (doc: T) => T,
  stillAllowed: (doc: T) => boolean
): Promise<ReplaceIfUnchangedResult<T>> {
  const container = getContainer();
  try {
    await container.item(id, pk).replace(applyChange(baseDoc), { accessCondition: { type: "IfMatch", condition: etag } });
    return { ok: true };
  } catch (err) {
    if (!isPreconditionFailed(err)) throw err;

    const fresh = await getDocWithEtag<T>(id, pk);
    if (!fresh) return { ok: false, reason: "not_found" };
    if (!stillAllowed(fresh.doc)) return { ok: false, reason: "rejected", latest: fresh.doc };

    try {
      await container.item(id, pk).replace(applyChange(fresh.doc), { accessCondition: { type: "IfMatch", condition: fresh.etag } });
      return { ok: true };
    } catch (retryErr) {
      if (!isPreconditionFailed(retryErr)) throw retryErr;
      // Lost the race twice in a row - treat the second collision as a
      // genuine loss rather than retrying indefinitely.
      return { ok: false, reason: "rejected", latest: fresh.doc };
    }
  }
}
