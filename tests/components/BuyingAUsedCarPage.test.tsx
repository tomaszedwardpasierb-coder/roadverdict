// Place at: tests/components/BuyingAUsedCarPage.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import BuyingAUsedCarPage from "@/app/guides/buying-a-used-car/page";

describe("BuyingAUsedCarPage", () => {
  it("renders the real heading and the key checklist sections", () => {
    render(<BuyingAUsedCarPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "What to Check Before Buying a Used Car"
    );
    expect(screen.getByRole("heading", { name: "The paperwork, first" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Checking the car itself" })).toBeInTheDocument();
    // Car-specific inspection point that should never appear on the motorcycle version.
    expect(screen.getByText(/Cambelt or timing chain history/)).toBeInTheDocument();
  });

  it("links out to the real car Buying Guide tool for the last-mile check, not the motorcycle version", () => {
    render(<BuyingAUsedCarPage />);
    const links = screen.getAllByRole("link", { name: "RoadVerdict's free Buying Guide" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/cars/buying-guide");
    }
  });

  it("embeds a BreadcrumbList script pointed at this guide's real URL", () => {
    const { container } = render(<BuyingAUsedCarPage />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const breadcrumb = Array.from(scripts).find((s) => JSON.parse(s.textContent ?? "{}")["@type"] === "BreadcrumbList");
    expect(breadcrumb).toBeDefined();
    const parsed = JSON.parse(breadcrumb?.textContent ?? "{}");
    expect(parsed.itemListElement[1].item).toBe("https://roadverdict.co.uk/guides/buying-a-used-car");
  });

  it("embeds an FAQPage script with real questions matching the visible content", () => {
    const { container } = render(<BuyingAUsedCarPage />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const faq = Array.from(scripts).find((s) => JSON.parse(s.textContent ?? "{}")["@type"] === "FAQPage");
    expect(faq).toBeDefined();
    const parsed = JSON.parse(faq?.textContent ?? "{}");
    expect(parsed.mainEntity.length).toBeGreaterThanOrEqual(3);
    expect(parsed.mainEntity[0].name).toMatch(/paperwork/i);
  });
});
