// Place at: tests/components/ComparisonPages.test.tsx
//
// The two "alternative" pages and the motorcycle service log page: each
// carries its own breadcrumb and FAQ markup, links to sign-up, and the
// comparison pages say where the other app is the better choice, date their
// facts and disclaim any connection.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import VehicleSmartAlternativePage from "@/app/vehicle-smart-alternative/page";
import DrivvoAlternativePage from "@/app/drivvo-alternative/page";
import MotorcycleServiceLogAppPage from "@/app/motorcycle-service-log-app/page";
import { PRO_ANNUAL_PRICE, PRO_MONTHLY_PRICE } from "@/lib/proPlan";

function jsonLd(container: HTMLElement, type: string) {
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  const found = Array.from(scripts).find((s) => JSON.parse(s.textContent ?? "{}")["@type"] === type);
  return found ? JSON.parse(found.textContent ?? "{}") : undefined;
}

const PAGES = [
  { name: "Vehicle Smart alternative", Page: VehicleSmartAlternativePage, path: "/vehicle-smart-alternative" },
  { name: "Drivvo alternative", Page: DrivvoAlternativePage, path: "/drivvo-alternative" },
  { name: "Motorcycle service log app", Page: MotorcycleServiceLogAppPage, path: "/motorcycle-service-log-app" },
] as const;

describe.each(PAGES)("$name page", ({ Page, path }) => {
  it("embeds a BreadcrumbList pointed at its own URL", () => {
    const { container } = render(<Page />);
    expect(jsonLd(container, "BreadcrumbList")?.itemListElement[1].item).toBe(`https://roadverdict.co.uk${path}`);
  });

  it("marks up exactly the questions shown on the page", () => {
    const { container } = render(<Page />);
    const faq = jsonLd(container, "FAQPage");
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(3);
    for (const q of faq.mainEntity) {
      expect(screen.getByRole("heading", { level: 3, name: q.name })).toBeInTheDocument();
    }
  });

  it("links to the free sign-up", () => {
    render(<Page />);
    expect(screen.getByRole("link", { name: /^Start a free/ })).toHaveAttribute("href", "/login?redirect=%2Fdashboard");
  });
});

describe("comparison pages stay honest", () => {
  it("Vehicle Smart: says where it's better, dates the facts, quotes our real prices and disclaims any connection", () => {
    render(<VehicleSmartAlternativePage />);
    expect(screen.getByRole("heading", { name: "Where Vehicle Smart is the better choice" })).toBeInTheDocument();
    expect(screen.getByText(/checked on 9 October 2026/)).toBeInTheDocument();
    expect(screen.getByText(`${PRO_MONTHLY_PRICE} a month or ${PRO_ANNUAL_PRICE} a year, 14-day free trial`)).toBeInTheDocument();
    expect(screen.getByText(/not affiliated with, or endorsed by, Vehicle Smart Ltd/)).toBeInTheDocument();
  });

  it("Drivvo: says where they're better, admits there's no importer yet, and disclaims any connection", () => {
    render(<DrivvoAlternativePage />);
    expect(screen.getByRole("heading", { name: "Where Drivvo and Fuelio are the better choice" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Can I import my Drivvo or Fuelio history into RoadVerdict?" })).toBeInTheDocument();
    expect(screen.getByText(/Not yet - there’s no importer/)).toBeInTheDocument();
    expect(screen.getByText(/not affiliated with, or endorsed by, either of them/)).toBeInTheDocument();
  });

  it("the motorcycle page covers the bike-specific jobs", () => {
    render(<MotorcycleServiceLogAppPage />);
    for (const job of [/valve clearance/i, /chain and sprockets/i, /brake fluid/i]) {
      expect(screen.getAllByText(job).length).toBeGreaterThan(0);
    }
  });
});
