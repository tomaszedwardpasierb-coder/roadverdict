// Place at: tests/components/BuyingAUsedMotorcyclePage.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import BuyingAUsedMotorcyclePage from "@/app/guides/buying-a-used-motorcycle/page";

describe("BuyingAUsedMotorcyclePage", () => {
  it("renders the real heading and the key checklist sections", () => {
    render(<BuyingAUsedMotorcyclePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "What to Check Before Buying a Used Motorcycle"
    );
    expect(screen.getByRole("heading", { name: "The paperwork, first" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Checking the bike itself" })).toBeInTheDocument();
    // Bike-specific inspection point that should never appear on the car version.
    expect(screen.getByText(/Chain and sprockets/)).toBeInTheDocument();
  });

  it("links out to the real Buying Guide tool for the last-mile check, not the car version", () => {
    render(<BuyingAUsedMotorcyclePage />);
    const links = screen.getAllByRole("link", { name: "RoadVerdict's free Buying Guide" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/buying-guide");
    }
  });

  it("embeds a BreadcrumbList script pointed at this guide's real URL", () => {
    const { container } = render(<BuyingAUsedMotorcyclePage />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const breadcrumb = Array.from(scripts).find((s) => JSON.parse(s.textContent ?? "{}")["@type"] === "BreadcrumbList");
    expect(breadcrumb).toBeDefined();
    const parsed = JSON.parse(breadcrumb?.textContent ?? "{}");
    expect(parsed.itemListElement[1].item).toBe("https://roadverdict.co.uk/guides/buying-a-used-motorcycle");
  });

  it("embeds an FAQPage script with real questions matching the visible content", () => {
    const { container } = render(<BuyingAUsedMotorcyclePage />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const faq = Array.from(scripts).find((s) => JSON.parse(s.textContent ?? "{}")["@type"] === "FAQPage");
    expect(faq).toBeDefined();
    const parsed = JSON.parse(faq?.textContent ?? "{}");
    expect(parsed.mainEntity.length).toBeGreaterThanOrEqual(3);
    expect(parsed.mainEntity[0].name).toMatch(/paperwork/i);
  });
});
