// Place at: src/lib/admin/cronLock.ts
//
// One run of a job at a time. check-reminders reads every reminder up front
// and stamps each one as it notifies, so a second run starting before the
// first has finished sends the not-yet-stamped ones again - a second email,
// push and bell notice. Two schedulers call these jobs (the Logic App, plus
// an outside caller found in October), and since the clocks went back on
// 25 Oct 2026 both fire at 09:00 within seconds; on 26, 28 and 29 Oct the
// two runs overlapped.
//
// The lock is one document per job: whoever creates it runs, and it's
// deleted at the end. It also expires, so a run that died halfway can't
// block the next day's. Taken only after the cron secret is checked, so a
// stranger can't hold it. A job that should run once a day can also take
// a second, longer lock and simply not release it (check-reminders does).
import { getContainer } from "@/lib/cosmos";

const PK = "system";
const DEFAULT_HOLD_MS = 15 * 60 * 1000;

// Set by /tomasz's "Run now" (admin/run-cron), so a job can tell an
// admin's deliberate run from a scheduler's call.
export const MANUAL_RUN_HEADER = "x-cron-manual";

type CronLockDoc = { id: string; pk: string; type: "cronLock"; name: string; until: string };

function status(err: unknown): number | undefined {
  return (err as { code?: number } | null)?.code;
}

// true: this run holds the lock and goes ahead. false: another run has it.
export async function acquireCronLock(name: string, holdMs = DEFAULT_HOLD_MS, now = Date.now()): Promise<boolean> {
  const container = getContainer();
  const doc: CronLockDoc = { id: `cronLock::${name}`, pk: PK, type: "cronLock", name, until: new Date(now + holdMs).toISOString() };
  try {
    await container.items.create(doc);
    return true;
  } catch (err) {
    // Can't tell (database trouble): running beats skipping the day.
    if (status(err) !== 409) return true;
  }
  try {
    const { resource } = await container.item(doc.id, PK).read<CronLockDoc & { _etag: string }>();
    if (resource && new Date(resource.until).getTime() > now) return false;
    // Left behind by a run that died: take it over, unless another run
    // beats this one to it (412).
    await container.item(doc.id, PK).replace(doc, resource ? { accessCondition: { type: "IfMatch", condition: resource._etag } } : undefined);
    return true;
  } catch {
    return false;
  }
}

export async function releaseCronLock(name: string): Promise<void> {
  try {
    await getContainer().item(`cronLock::${name}`, PK).delete();
  } catch {
    // It expires anyway.
  }
}
