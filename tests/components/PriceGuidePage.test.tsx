// Place at: tests/components/PriceGuidePage.test.tsx
//
// The Sportsbikeshop parts line belongs on motorcycle price guides only -
// Sportsbikeshop sells nothing for cars, so no car guide may show it.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceGuidePage } from "@/components/seo/PriceGuidePage";
import { PRICE_GUIDES, findPriceGuide } from "@/lib/seo/priceGuides";

describe("PriceGuidePage affiliate line", () => {
  it.each(PRICE_GUIDES.car.map((guide) => [guide.slug, guide] as const))(
    "shows no affiliate link on the car %s guide",
    (_slug, guide) => {
      render(<PriceGuidePage guide={guide} />);
      expect(screen.queryByRole("link", { name: "Affiliate link" })).not.toBeInTheDocument();
      expect(screen.queryByText(/Sportsbikeshop/)).not.toBeInTheDocument();
    }
  );

  it.each(PRICE_GUIDES.motorcycle.filter((guide) => guide.kind === "benchmark").map((guide) => [guide.slug, guide] as const))(
    "offers labelled, sponsored parts links on the motorcycle %s guide",
    (_slug, guide) => {
      render(<PriceGuidePage guide={guide} />);
      expect(screen.getByRole("link", { name: "Affiliate link" })).toHaveAttribute("href", "/privacy#affiliate-links");
      const links = screen.getAllByRole("link", { name: /at Sportsbikeshop/ });
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) expect(link).toHaveAttribute("rel", "sponsored nofollow noopener");
    }
  );

  it("shows no affiliate link on the motorcycle MOT guide (nothing to buy)", () => {
    render(<PriceGuidePage guide={findPriceGuide("motorcycle", "mot")!} />);
    expect(screen.queryByRole("link", { name: "Affiliate link" })).not.toBeInTheDocument();
  });

  it("links brake pads from the motorcycle brake pads guide", () => {
    render(<PriceGuidePage guide={findPriceGuide("motorcycle", "brake-pads")!} />);
    expect(screen.getByRole("link", { name: "Brake pads at Sportsbikeshop (opens in a new tab)" })).toBeInTheDocument();
    expect(screen.getByText(/Doing it yourself\?/)).toBeInTheDocument();
  });

  it("asks 'Buying your own?' on the tyres guide - few riders fit their own tyres", () => {
    render(<PriceGuidePage guide={findPriceGuide("motorcycle", "tyres")!} />);
    expect(screen.getByRole("link", { name: "Tyres at Sportsbikeshop (opens in a new tab)" })).toBeInTheDocument();
    expect(screen.getByText(/Buying your own\?/)).toBeInTheDocument();
    expect(screen.queryByText(/Doing it yourself\?/)).not.toBeInTheDocument();
  });
});
