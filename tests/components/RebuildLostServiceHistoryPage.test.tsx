// Place at: tests/components/RebuildLostServiceHistoryPage.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RebuildLostServiceHistoryPage from "@/app/guides/rebuild-lost-service-history/page";

function jsonLd(container: HTMLElement, type: string) {
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  const found = Array.from(scripts).find((s) => JSON.parse(s.textContent ?? "{}")["@type"] === type);
  return found ? JSON.parse(found.textContent ?? "{}") : undefined;
}

describe("RebuildLostServiceHistoryPage", () => {
  it("renders the heading and its key sections", () => {
    render(<RebuildLostServiceHistoryPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("How to Rebuild a Lost Service History");
    expect(screen.getByRole("heading", { name: "1. Start with the MOT history" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What not to do" })).toBeInTheDocument();
    // Motorcycles and cars both get their own points.
    expect(screen.getAllByText(/valve clearance/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/cambelt/i).length).toBeGreaterThan(0);
  });

  it("embeds a BreadcrumbList pointed at this guide's real URL", () => {
    const { container } = render(<RebuildLostServiceHistoryPage />);
    expect(jsonLd(container, "BreadcrumbList")?.itemListElement[1].item).toBe("https://roadverdict.co.uk/guides/rebuild-lost-service-history");
  });

  it("marks up exactly the questions shown on the page", () => {
    const { container } = render(<RebuildLostServiceHistoryPage />);
    const faq = jsonLd(container, "FAQPage");
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(3);
    for (const q of faq.mainEntity) {
      expect(screen.getByRole("heading", { level: 3, name: q.name })).toBeInTheDocument();
    }
  });

  it("links to the free logbook sign-up", () => {
    render(<RebuildLostServiceHistoryPage />);
    expect(screen.getByRole("link", { name: "Start a free logbook" })).toHaveAttribute("href", "/login?redirect=%2Fdashboard");
  });
});
