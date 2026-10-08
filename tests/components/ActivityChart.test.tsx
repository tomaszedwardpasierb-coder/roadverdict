// Place at: tests/components/ActivityChart.test.tsx
//
// The 30-day daily-active-users chart on /tomasz: one stacked bar a day, app vs
// website, with "not split" for days recorded before that was tracked.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityChart } from "@/app/tomasz/ActivityChart";
import type { DauSeries } from "@/lib/admin/testerReport";

// The same short date the chart prints, built with the same call so the test doesn't depend on how
// this machine's locale data spells September.
const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function series(overrides: Record<number, Partial<{ app: number; web: number; unknown: number }>> = {}): DauSeries {
  const days = Array.from({ length: 30 }, (_, i) => {
    const o = overrides[i] ?? {};
    const app = o.app ?? 0;
    const web = o.web ?? 0;
    const unknown = o.unknown ?? 0;
    const date = new Date(Date.UTC(2026, 8, 9 + i));
    return { day: date.toISOString().slice(0, 10), app, web, unknown, total: app + web + unknown };
  });
  return { days, peak: Math.max(0, ...days.map((d) => d.total)), today: days[29].total };
}

describe("ActivityChart", () => {
  it("has an accessible summary of today and the busiest day", () => {
    render(<ActivityChart title="Testers" series={series({ 29: { app: 3 }, 20: { app: 2, web: 4 } })} />);
    expect(screen.getByRole("img", { name: "Testers: today 3, busiest day 6, over the last 30 days." })).toBeInTheDocument();
    expect(screen.getByText(/today 3 - busiest day 6/)).toBeInTheDocument();
  });

  it("draws one bar group per day with a tooltip naming the counts", () => {
    const { container } = render(<ActivityChart title="Everyone except testers" series={series({ 29: { app: 2, web: 1, unknown: 1 } })} />);
    const groups = container.querySelectorAll("g[data-day]");
    expect(groups).toHaveLength(30);
    expect(groups[29].querySelector("title")?.textContent).toBe(`${label("2026-10-08")}: 4 active (2 app, 1 website, 1 not split)`);
    expect(groups[0].querySelector("title")?.textContent).toBe(`${label("2026-09-09")}: 0 active (0 app, 0 website)`);
  });

  it("colours each day's bar by client, and draws nothing for an empty day", () => {
    const { container } = render(<ActivityChart title="Testers" series={series({ 29: { app: 2, web: 1, unknown: 1 } })} />);
    const colours = [...container.querySelectorAll("g[data-day]")[29].querySelectorAll("rect")].map((r) => r.getAttribute("fill"));
    expect(colours).toEqual(["transparent", "#EE9A2E", "#3E4C6B", "#C9C6BD"]);
    expect(container.querySelectorAll("g[data-day]")[0].querySelectorAll("rect")).toHaveLength(1); // just the hover area
  });

  it("scales the bars to the busiest day, with a floor so a quiet chart isn't blown up", () => {
    const { container } = render(<ActivityChart title="Testers" series={series({ 29: { app: 1 } })} />);
    const bar = container.querySelectorAll("g[data-day]")[29].querySelectorAll("rect")[1];
    const plotHeight = 130 - 8 - 20;
    expect(Number(bar.getAttribute("height"))).toBeCloseTo(plotHeight / 3, 5); // one user on a minimum scale of 3
  });

  it("labels the first and last day and explains the colours", () => {
    render(<ActivityChart title="Testers" series={series()} />);
    expect(screen.getByText(label("2026-09-09"))).toBeInTheDocument();
    expect(screen.getByText(label("2026-10-08"))).toBeInTheDocument();
    expect(screen.getByText("Android app")).toBeInTheDocument();
    expect(screen.getByText("Website")).toBeInTheDocument();
    expect(screen.getByText(/Not split/)).toBeInTheDocument();
  });
});
