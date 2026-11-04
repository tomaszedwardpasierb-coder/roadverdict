// Place at: tests/components/MotAreaStatisticsPage.test.tsx
//
// The MOT-by-area page: it leads with the highest and lowest areas, ranks
// every area in one table with Great Britain at the foot, says what the
// figures can't tell you, and names its source and how to cite it.
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MotAreaStatisticsPage, { metadata } from "@/app/mot-statistics/by-area/page";
import { MOT_AREA_STATISTICS as A } from "@/lib/mot/motAreaStatistics";

function jsonLd(container: HTMLElement, type: string) {
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  const found = Array.from(scripts).find((s) => JSON.parse(s.textContent ?? "{}")["@type"] === type);
  return found ? JSON.parse(found.textContent ?? "{}") : undefined;
}

describe("MotAreaStatisticsPage", () => {
  it("leads with Fife as the highest fail rate and Ilford as the lowest", () => {
    render(<MotAreaStatisticsPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("MOT fail rates by area 2025");
    expect(String(metadata.description)).toMatch(/^Kirkcaldy \(Fife\) has Britain's highest car MOT fail rate \(36\.2%\), Ilford the lowest \(20\.0%\)/);
    expect(screen.getAllByText(/36\.2%/).length).toBeGreaterThan(0);
  });

  it("ranks every area in one table, highest first, with Great Britain at the foot", () => {
    render(<MotAreaStatisticsPage />);
    const table = screen.getByRole("table", { name: /Car MOT fail rates by postcode area, 2025/ });
    const rows = within(table).getAllByRole("row");
    expect(rows.length).toBe(1 + A.areas.length + 1);
    expect(rows[1]).toHaveTextContent(/^1Kirkcaldy \(Fife\) \(KY\)/);
    expect(rows[A.areas.length]).toHaveTextContent(`${A.areas.length}Ilford (IG)`);
    expect(rows.at(-1)).toHaveTextContent(/Great Britain.*27\.7%/);
  });

  it("says the area is the test centre's and that the table shows where, not why", () => {
    render(<MotAreaStatisticsPage />);
    expect(screen.getByText(/The area is where the test centre is,/)).toBeInTheDocument();
    expect(screen.getByText(/It shows where cars fail more, not why\./)).toBeInTheDocument();
  });

  it("names DVSA as the source, with the licence, and says how to cite the page", () => {
    render(<MotAreaStatisticsPage />);
    expect(screen.getByRole("link", { name: "DVSA: anonymised MOT tests and results" })).toHaveAttribute(
      "href",
      "https://open.data.dvsa.gov.uk/mot-anonymised/index.html"
    );
    expect(screen.getByRole("link", { name: "Open Government Licence v3.0" })).toBeInTheDocument();
    expect(screen.getByText(/roadverdict\.co\.uk\/mot-statistics\/by-area, from DVSA data/)).toBeInTheDocument();
  });

  it("marks up exactly the questions shown, the full breadcrumb trail and the dataset", () => {
    const { container } = render(<MotAreaStatisticsPage />);
    const faq = jsonLd(container, "FAQPage");
    for (const q of faq.mainEntity) {
      expect(screen.getByRole("heading", { level: 3, name: q.name })).toBeInTheDocument();
    }
    const crumbs = jsonLd(container, "BreadcrumbList").itemListElement.map((c: { item: string }) => c.item);
    expect(crumbs).toEqual([
      "https://roadverdict.co.uk/",
      "https://roadverdict.co.uk/mot-statistics",
      "https://roadverdict.co.uk/mot-statistics/by-area",
    ]);
    expect(jsonLd(container, "Dataset")).toMatchObject({ spatialCoverage: "Great Britain", temporalCoverage: "2025-01/2025-12" });
  });

  it("links on to the free MOT check and back to the national statistics", () => {
    render(<MotAreaStatisticsPage />);
    expect(screen.getByRole("link", { name: "Free MOT history check" })).toHaveAttribute("href", "/mot-check");
    expect(screen.getAllByRole("link", { name: "UK MOT statistics" }).every((a) => a.getAttribute("href") === "/mot-statistics")).toBe(true);
  });
});
