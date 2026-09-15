// Place at: tests/components/CostOfOwningAMotorcyclePage.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CostOfOwningAMotorcyclePage from "@/app/guides/cost-of-owning-a-motorcycle/page";

describe("CostOfOwningAMotorcyclePage", () => {
  it("renders the real heading and the key cost-category sections", () => {
    render(<CostOfOwningAMotorcyclePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "The Real Cost of Owning a Motorcycle in the UK"
    );
    expect(screen.getByRole("heading", { name: "Servicing and consumables" })).toBeInTheDocument();
    // Motorcycle-specific cost category that should never appear on the car version.
    expect(screen.getByRole("heading", { name: "Riding kit" })).toBeInTheDocument();
  });

  it("links to the real motorcycle Cost Calculator, not the car version", () => {
    render(<CostOfOwningAMotorcyclePage />);
    expect(screen.getByRole("link", { name: "Cost Calculator" })).toHaveAttribute("href", "/cost-calculator");
  });

  it("embeds a BreadcrumbList script pointed at this guide's real URL", () => {
    const { container } = render(<CostOfOwningAMotorcyclePage />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const parsed = JSON.parse(script?.textContent ?? "{}");
    expect(parsed["@type"]).toBe("BreadcrumbList");
    expect(parsed.itemListElement[1].item).toBe("https://roadverdict.co.uk/guides/cost-of-owning-a-motorcycle");
  });
});
