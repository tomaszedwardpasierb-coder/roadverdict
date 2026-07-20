// Place at: src/lib/tracker/dateRange.ts
export const RANGE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "1w", label: "Last week" },
  { value: "1m", label: "Last month" },
  { value: "6m", label: "Last 6 months" },
  { value: "1y", label: "Last year" },
  { value: "ytd", label: "YTD" },
] as const;

export type RangeValue = (typeof RANGE_OPTIONS)[number]["value"];

export function filterByDateRange<T extends { date: string }>(items: T[], range: RangeValue): T[] {
  if (range === "all") return items;
  const now = new Date();
  let cutoff: Date;
  if (range === "1w") cutoff = new Date(now.getTime() - 7 * 86400000);
  else if (range === "1m") cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  else if (range === "6m") cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
  else if (range === "1y") cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  else cutoff = new Date(now.getFullYear(), 0, 1); // ytd
  return items.filter((i) => new Date(i.date) >= cutoff);
}
