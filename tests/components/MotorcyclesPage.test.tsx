// Place at: tests/components/MotorcyclesPage.test.tsx
//
// MotorcyclesPage is a plain static Server Component now (prerendered at
// build time - no session read, no request headers), twin of
// tests/components/CarsPage.test.tsx. What it renders is the signed-out
// version every anonymous visitor and search crawler gets; the signed-in
// CTA variants are resolved client-side by ViewerCtaLink and covered in
// tests/components/ViewerCta.test.tsx.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MotorcyclesPage from "@/app/motorcycles/page";

describe("MotorcyclesPage", () => {
  it("renders the marketing page with the CTA pointed at login with the addVehicle redirect", () => {
    render(<MotorcyclesPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/really costs/i);
    const ctas = screen.getAllByRole("link", { name: /start tracking your bike free/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/login?redirect=%2Fdashboard%3FaddVehicle%3Dbike");
    }
  });

  it("never links to the car-only tool pages", () => {
    render(<MotorcyclesPage />);

    for (const href of ["/cars/quote-checker", "/cars/cost-calculator", "/cars/buying-guide"]) {
      const link = screen.queryByRole("link", { name: new RegExp(href) });
      if (link) expect(link).not.toHaveAttribute("href", href);
    }
  });

  it("links to its own three motorcycle tool pages", () => {
    render(<MotorcyclesPage />);

    expect(screen.getByRole("link", { name: /quote checker/i })).toHaveAttribute("href", "/quote-checker");
    expect(screen.getByRole("link", { name: /cost calculator/i })).toHaveAttribute("href", "/cost-calculator");
    expect(screen.getByRole("link", { name: /buying guide/i })).toHaveAttribute("href", "/buying-guide");
  });

  it("links to the dedicated car hub for a signed-out visitor", () => {
    render(<MotorcyclesPage />);

    expect(screen.getByRole("link", { name: /drive a car instead/i })).toHaveAttribute("href", "/cars");
  });

  it("embeds the WebApplication JSON-LD script, with no nonce (a data block CSP never restricts)", () => {
    const { container } = render(<MotorcyclesPage />);

    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBeGreaterThanOrEqual(1);
    for (const script of scripts) {
      expect(script.getAttribute("nonce")).toBeNull();
    }
    const webAppScript = Array.from(scripts).find((s) => JSON.parse(s.textContent ?? "{}")["@type"] === "WebApplication");
    expect(webAppScript).toBeDefined();
    const parsed = JSON.parse(webAppScript?.textContent ?? "{}");
    expect(parsed.name).toBe("RoadVerdict for motorcycles");
    expect(parsed.offers).toMatchObject({ price: "0", priceCurrency: "GBP" });
  });

  it("embeds a BreadcrumbList script pointed at the real /motorcycles URL", () => {
    const { container } = render(<MotorcyclesPage />);

    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const breadcrumbScript = Array.from(scripts).find(
      (s) => JSON.parse(s.textContent ?? "{}")["@type"] === "BreadcrumbList"
    );
    expect(breadcrumbScript).toBeDefined();
    const parsed = JSON.parse(breadcrumbScript?.textContent ?? "{}");
    expect(parsed.itemListElement[1].item).toBe("https://roadverdict.co.uk/motorcycles");
  });

  it("renders all five feature cards", () => {
    render(<MotorcyclesPage />);

    for (const title of ["Service history", "Fuel log", "Bills, fines & tolls", "Reminders that fire early", "Receipt scanning"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
