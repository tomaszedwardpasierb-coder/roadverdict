// Place at: tests/components/HomePage.test.tsx
//
// HomePage is a plain static Server Component now - no session read, no
// request headers - so it renders directly. The signed-in visitor's
// redirect to /dashboard moved to middleware (see
// tests/unit/middleware.test.ts), which is what lets this page be
// prerendered at build time instead of rendered per visitor.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the marketing homepage", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/really costs/i);
    expect(screen.getAllByRole("link", { name: /start logging your motorcycle/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /start logging your car/i }).length).toBeGreaterThan(0);
  });

  it("embeds the WebApplication and Organization JSON-LD under one @graph", () => {
    const { container } = render(<HomePage />);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    // A data block, never executed, so CSP doesn't apply and it needs no nonce.
    expect(script?.getAttribute("nonce")).toBeNull();
    const parsed = JSON.parse(script?.textContent ?? "{}");
    const webApp = parsed["@graph"].find((node: { "@type": string }) => node["@type"] === "WebApplication");
    expect(webApp.name).toBe("RoadVerdict");
    expect(webApp.offers).toMatchObject({ price: "0", priceCurrency: "GBP" });
    const org = parsed["@graph"].find((node: { "@type": string }) => node["@type"] === "Organization");
    expect(org.name).toBe("RoadVerdict");
    expect(org.sameAs).toContain("https://www.instagram.com/RoadVerdict.web");
  });

  it("renders all four 'problems' cards", () => {
    render(<HomePage />);

    expect(screen.getByText("The quote you can't verify")).toBeInTheDocument();
    expect(screen.getByText("The receipt you can't find")).toBeInTheDocument();
    expect(screen.getByText("The cost you never added up")).toBeInTheDocument();
    expect(screen.getByText("The buy you'll regret")).toBeInTheDocument();
  });

  it("renders every solution card heading", () => {
    render(<HomePage />);

    for (const title of ["Quote checker", "Full history log", "Buying guide", "True running cost", "Sell with proof", "Smart reminders"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  // Straight to the correct add-vehicle flow, not a marketing-page
  // detour that then asks the visitor to "start logging" a second time -
  // see dashboard/page.tsx's addVehicle handling, which forces this exact
  // kind once signed in, regardless of any activeVehicleKind cookie.
  it("links every 'Start logging your motorcycle' CTA to the bike add-vehicle flow", () => {
    render(<HomePage />);

    const ctaLinks = screen.getAllByRole("link", { name: /start logging your motorcycle/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    for (const link of ctaLinks) {
      expect(link).toHaveAttribute("href", "/login?redirect=%2Fdashboard%3FaddVehicle%3Dbike");
    }
  });

  it("links every 'Start logging your car' CTA to the car add-vehicle flow", () => {
    render(<HomePage />);

    const ctaLinks = screen.getAllByRole("link", { name: /start logging your car/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    for (const link of ctaLinks) {
      expect(link).toHaveAttribute("href", "/login?redirect=%2Fdashboard%3FaddVehicle%3Dcar");
    }
  });

  // The three solution cards with a real standalone public page to send
  // people to are real links, not just decorative text - the other
  // three (Full history log, Sell with proof, Smart reminders) are
  // account-only dashboard features with no public page of their own,
  // so they deliberately stay as plain cards.
  it("links the Quote checker, Buying guide, and True running cost solution cards to their own tool pages", () => {
    render(<HomePage />);

    expect(screen.getByRole("link", { name: /quote checker/i })).toHaveAttribute("href", "/quote-checker");
    expect(screen.getByRole("link", { name: /buying guide/i })).toHaveAttribute("href", "/buying-guide");
    expect(screen.getByRole("link", { name: /true running cost/i })).toHaveAttribute("href", "/cost-calculator");
  });
});
