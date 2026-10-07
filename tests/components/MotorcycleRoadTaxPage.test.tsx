// Place at: tests/components/MotorcycleRoadTaxPage.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MotorcycleRoadTaxPage from "@/app/guides/motorcycle-road-tax/page";

function jsonLd(container: HTMLElement, type: string) {
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  const found = Array.from(scripts).find((s) => JSON.parse(s.textContent ?? "{}")["@type"] === type);
  return found ? JSON.parse(found.textContent ?? "{}") : undefined;
}

describe("MotorcycleRoadTaxPage", () => {
  it("shows the official rate for every engine-size band", () => {
    render(<MotorcycleRoadTaxPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Motorcycle Road Tax");
    const table = screen.getByRole("table");
    for (const [band, rate] of [["Up to 150cc", "£27"], ["151cc to 400cc", "£59"], ["401cc to 600cc", "£90"], ["Over 600cc", "£125"]]) {
      const row = within(table).getByRole("row", { name: new RegExp(band) });
      expect(row).toHaveTextContent(rate);
    }
    expect(within(table).getByRole("row", { name: /Over 600cc/ })).toHaveTextContent("£131.25");
  });

  it("embeds a BreadcrumbList pointed at this guide's real URL", () => {
    const { container } = render(<MotorcycleRoadTaxPage />);
    expect(jsonLd(container, "BreadcrumbList")?.itemListElement[1].item).toBe("https://roadverdict.co.uk/guides/motorcycle-road-tax");
  });

  it("marks up exactly the questions shown on the page", () => {
    const { container } = render(<MotorcycleRoadTaxPage />);
    const faq = jsonLd(container, "FAQPage");
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(3);
    for (const q of faq.mainEntity) {
      expect(screen.getByRole("heading", { level: 3, name: q.name })).toBeInTheDocument();
    }
  });

  it("links on to the running cost calculator and the MOT price guide", () => {
    render(<MotorcycleRoadTaxPage />);
    expect(screen.getByRole("link", { name: "motorcycle running cost calculator" })).toHaveAttribute("href", "/cost-calculator");
    expect(screen.getByRole("link", { name: "what a motorcycle MOT costs" })).toHaveAttribute("href", "/motorcycles/costs/mot");
  });
});
