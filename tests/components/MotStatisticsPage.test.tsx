// Place at: tests/components/MotStatisticsPage.test.tsx
//
// The MOT statistics page: the headline figures come from DVSA's data (with
// the 2025-26 "dangerous" correction), the structured data matches what's on
// the page, and every source is named.
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MotStatisticsPage, { metadata } from "@/app/mot-statistics/page";

function jsonLd(container: HTMLElement, type: string) {
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  const found = Array.from(scripts).find((s) => JSON.parse(s.textContent ?? "{}")["@type"] === type);
  return found ? JSON.parse(found.textContent ?? "{}") : undefined;
}

describe("MotStatisticsPage", () => {
  it("leads with the first-time fail rates for cars and motorcycles", () => {
    render(<MotStatisticsPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("UK MOT statistics 2026");
    expect(screen.getAllByText(/27\.5%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/13\.4%/).length).toBeGreaterThan(0);
    expect(String(metadata.description)).toMatch(/27\.5% of cars and 13\.4% of motorcycles/);
  });

  it("shows the corrected dangerous-defect rates: 7.22% of cars, 4.11% of motorcycles", () => {
    render(<MotStatisticsPage />);
    const table = screen.getByRole("table", { name: /MOT results by vehicle type/ });
    expect(within(table).getByRole("row", { name: /Cars and light vans/ })).toHaveTextContent("7.22%");
    expect(within(table).getByRole("row", { name: /Motorcycles \(classes 1 and 2\)/ })).toHaveTextContent("4.11%");
    expect(within(table).getByRole("row", { name: /All MOT tests/ })).toHaveTextContent("35,480,950");
  });

  it("ranks the failure categories and keeps the trend back to 2013-14", () => {
    render(<MotStatisticsPage />);
    const tables = screen.getAllByRole("table");
    const carCats = tables.find((t) => t.getAttribute("aria-label")?.startsWith("Car MOT failures"))!;
    expect(within(carCats).getAllByRole("row")[1]).toHaveTextContent("Lamps, reflectors and electrical equipment");
    const trend = screen.getByRole("table", { name: /fail rates by year/ });
    expect(within(trend).getByRole("row", { name: /2013-14/ })).toHaveTextContent("40.0%");
  });

  it("names DVSA as the source, with the licence, and says how to cite the page", () => {
    render(<MotStatisticsPage />);
    expect(screen.getByRole("link", { name: "DVSA: MOT testing data for Great Britain" })).toHaveAttribute(
      "href",
      "https://www.gov.uk/government/statistical-data-sets/mot-testing-data-for-great-britain"
    );
    expect(screen.getByRole("link", { name: "Open Government Licence v3.0" })).toBeInTheDocument();
    expect(screen.getByText(/roadverdict\.co\.uk\/mot-statistics, from DVSA data/)).toBeInTheDocument();
  });

  it("marks up exactly the questions shown, a breadcrumb for its own URL and the dataset", () => {
    const { container } = render(<MotStatisticsPage />);
    const faq = jsonLd(container, "FAQPage");
    expect(faq.mainEntity.length).toBe(5);
    for (const q of faq.mainEntity) {
      expect(screen.getByRole("heading", { level: 3, name: q.name })).toBeInTheDocument();
    }
    expect(jsonLd(container, "BreadcrumbList")?.itemListElement[1].item).toBe("https://roadverdict.co.uk/mot-statistics");
    expect(jsonLd(container, "Dataset")).toMatchObject({ spatialCoverage: "Great Britain", temporalCoverage: "2013-04/2026-03" });
  });

  it("links on to the free MOT check and the repair price guides", () => {
    render(<MotStatisticsPage />);
    expect(screen.getByRole("link", { name: "Free MOT history check" })).toHaveAttribute("href", "/mot-check");
    expect(screen.getAllByRole("link").some((a) => a.getAttribute("href") === "/cars/costs/tyres")).toBe(true);
    expect(screen.getByRole("link", { name: "MOT fail rates by area" })).toHaveAttribute("href", "/mot-statistics/by-area");
  });
});
