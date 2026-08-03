// Place at: src/lib/tracker/backdateCheck.ts
//
// Detects claimed-date vs actually-logged-date discrepancies - the same
// signal already identified in the seller-verification research
// ("Progressive History vs Bulk Entry"), formalised here at both the
// per-entry and aggregate level. `createdAt` is set server-side at the
// moment a record is created and is never something the client can
// influence - unlike `date`, which is just whatever the user typed in.
// That asymmetry is what makes the comparison meaningful.

// Under this many days, backdating isn't flagged at all - logging a
// receipt a week late is completely normal, not suspicious. Only
// meaningful gaps are worth surfacing.
export const BACKDATE_THRESHOLD_DAYS = 7;

// A cluster of this many-or-more entries, all created within
// CLUSTER_WINDOW_MINUTES of each other, whose CLAIMED dates span at
// least CLUSTER_MIN_SPAN_DAYS, is flagged as likely bulk-backfilled
// history - the specific "years of fake history typed in one sitting
// right before selling" pattern.
export const CLUSTER_MIN_COUNT = 3;
export const CLUSTER_WINDOW_MINUTES = 60;
export const CLUSTER_MIN_SPAN_DAYS = 60;

export function daysBackdated(date: string, createdAt: string): number {
  const claimed = new Date(date).getTime();
  const logged = new Date(createdAt).getTime();
  return Math.round((logged - claimed) / 86400000);
}

export function isBackdated(date: string, createdAt: string): boolean {
  return daysBackdated(date, createdAt) > BACKDATE_THRESHOLD_DAYS;
}

// Factual, not accusatory - backdating a receipt from a drawer is
// completely normal. State the fact and let the reader draw their own
// conclusion, rather than editorialising for them.
export function backdateNotice(date: string, createdAt: string): string {
  const days = daysBackdated(date, createdAt);
  if (days <= BACKDATE_THRESHOLD_DAYS) return "";
  if (days < 60) return `Logged ${days} days after the claimed date`;
  const months = Math.round(days / 30);
  if (months < 24) return `Logged ${months} month${months === 1 ? "" : "s"} after the claimed date`;
  const years = Math.round(days / 365);
  return `Logged ${years} year${years === 1 ? "" : "s"} after the claimed date`;
}

export interface BackdateCheckItem {
  id: string;
  date: string;
  createdAt: string;
  hasAttachment: boolean;
}

export interface BulkBackdateCluster {
  count: number;
  spanDays: number;
  earliestClaimedDate: string;
  latestClaimedDate: string;
  loggedAt: string;
}

// Sorts by actual creation time, then slides a window across it - any
// run of CLUSTER_MIN_COUNT+ entries created within CLUSTER_WINDOW_MINUTES
// of each other, whose claimed dates span CLUSTER_MIN_SPAN_DAYS or more,
// becomes a cluster. A sliding window rather than fixed hour-buckets, so
// a run straddling an hour boundary (e.g. 12:59 and 13:01) is still
// caught correctly.
export function detectBulkBackdating(items: BackdateCheckItem[]): BulkBackdateCluster[] {
  const sorted = [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const windowMs = CLUSTER_WINDOW_MINUTES * 60 * 1000;
  const clusters: BulkBackdateCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const windowStart = new Date(sorted[i].createdAt).getTime();
    const groupIndices = [i];
    for (let j = i + 1; j < sorted.length; j++) {
      if (new Date(sorted[j].createdAt).getTime() - windowStart <= windowMs) {
        groupIndices.push(j);
      } else {
        break;
      }
    }
    if (groupIndices.length < CLUSTER_MIN_COUNT) continue;

    const group = groupIndices.map((idx) => sorted[idx]);
    const claimedTimes = group.map((g) => new Date(g.date).getTime());
    const min = Math.min(...claimedTimes);
    const max = Math.max(...claimedTimes);
    const spanDays = Math.round((max - min) / 86400000);

    if (spanDays >= CLUSTER_MIN_SPAN_DAYS) {
      clusters.push({
        count: group.length,
        spanDays,
        earliestClaimedDate: new Date(min).toISOString().slice(0, 10),
        latestClaimedDate: new Date(max).toISOString().slice(0, 10),
        loggedAt: sorted[i].createdAt,
      });
      groupIndices.forEach((idx) => used.add(idx));
    }
  }
  return clusters;
}
