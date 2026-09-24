// Place at: tests/components/CarsPage.test.tsx
//
// CarsPage is a plain static Server Component now (prerendered at build
// time - no session read, no request headers). What it renders is the
// signed-out version every anonymous visitor and search crawler gets; the
// signed-in CTA variants are resolved client-side by ViewerCtaLink and
// covered in tests/components/ViewerCta.test.tsx.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CarsPage from "@/app/cars/page";

describe("CarsPage", () => {
  it("renders the marketing page with the CTA pointed at login with the addVehicle redirect", () => {
    render(<CarsPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/really costs/i);
    const ctas = screen.getAllByRole("link", { name: /start tracking your car free/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/login?redirect=%2Fdashboard%3FaddVehicle%3Dcar");
    }
  });

  it("never links to the motorcycle-only tool pages", () => {
    render(<CarsPage />);

    for (const href of ["/quote-checker", "/cost-calculator", "/buying-guide"]) {
      const link = screen.queryByRole("link", { name: new RegExp(href) });
      // A link to the /cars/ prefixed version legitimately matches this
      // same regex (no leading anchor) - only reject an exact, un-prefixed
      // motorcycle URL.
      if (link) expect(link).not.toHaveAttribute("href", href);
    }
  });

  it("links to its own three car tool pages (Phase 7 - built once car price research landed)", () => {
    render(<CarsPage />);

    expect(screen.getByRole("link", { name: /quote checker/i })).toHaveAttribute("href", "/cars/quote-checker");
    expect(screen.getByRole("link", { name: /cost calculator/i })).toHaveAttribute("href", "/cars/cost-calculator");
    expect(screen.getByRole("link", { name: /buying guide/i })).toHaveAttribute("href", "/cars/buying-guide");
  });

  it("links to the dedicated motorcycle hub for a signed-out visitor", () => {
    render(<CarsPage />);

    expect(screen.getByRole("link", { name: /ride a motorcycle instead/i })).toHaveAttribute("href", "/motorcycles");
  });

  it("embeds the WebApplication JSON-LD script, with no nonce (a data block CSP never restricts)", () => {
    const { container } = render(<CarsPage />);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    expect(script?.getAttribute("nonce")).toBeNull();
    const parsed = JSON.parse(script?.textContent ?? "{}");
    expect(parsed["@type"]).toBe("WebApplication");
    expect(parsed.name).toBe("RoadVerdict for cars");
    expect(parsed.offers).toMatchObject({ price: "0", priceCurrency: "GBP" });
  });

  it("shows the shared hero illustration with descriptive alt text (for image search and screen readers), priority-loaded as the LCP element", () => {
    render(<CarsPage />);

    const img = screen.getByRole("img", { name: /car owner relaxing in a garage.*service history.*RoadVerdict/i });
    expect(img.getAttribute("src")).toContain(encodeURIComponent("/images/hero/garage-owner-cars-motorcycles.webp"));
    expect(img).toHaveAttribute("fetchpriority", "high");
    expect(img).not.toHaveAttribute("loading", "lazy");
  });

  it("lists the hero image in its WebApplication structured data", () => {
    const { container } = render(<CarsPage />);

    const scripts = Array.from(container.querySelectorAll('script[type="application/ld+json"]'));
    const webApp = scripts.map((s) => JSON.parse(s.textContent ?? "{}")).find((j) => j["@type"] === "WebApplication");
    expect(webApp.image).toBe("https://roadverdict.co.uk/images/hero/garage-owner-cars-motorcycles.webp");
  });

  it("renders all five feature cards", () => {
    render(<CarsPage />);

    for (const title of ["Service history", "Fuel log", "Bills & MOT", "Reminders that fire early", "Receipt scanning"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
