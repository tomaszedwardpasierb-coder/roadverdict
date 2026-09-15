// Place at: tests/components/CostOfOwningACarPage.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CostOfOwningACarPage from "@/app/guides/cost-of-owning-a-car/page";

describe("CostOfOwningACarPage", () => {
  it("renders the real heading and the key cost-category sections", () => {
    render(<CostOfOwningACarPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "The Real Cost of Owning a Car in the UK"
    );
    expect(screen.getByRole("heading", { name: "Servicing and consumables" })).toBeInTheDocument();
    // Car-specific cost category that should never appear on the motorcycle version.
    expect(screen.getByRole("heading", { name: "City charges" })).toBeInTheDocument();
  });

  it("links to the real car Cost Calculator, not the motorcycle version", () => {
    render(<CostOfOwningACarPage />);
    expect(screen.getByRole("link", { name: "Cost Calculator" })).toHaveAttribute("href", "/cars/cost-calculator");
  });

  it("embeds a BreadcrumbList script pointed at this guide's real URL", () => {
    const { container } = render(<CostOfOwningACarPage />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const parsed = JSON.parse(script?.textContent ?? "{}");
    expect(parsed["@type"]).toBe("BreadcrumbList");
    expect(parsed.itemListElement[1].item).toBe("https://roadverdict.co.uk/guides/cost-of-owning-a-car");
  });
});
