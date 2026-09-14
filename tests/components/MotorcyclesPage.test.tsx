// Place at: tests/components/MotorcyclesPage.test.tsx
//
// MotorcyclesPage is an async Server Component (calls getSession(),
// headers(), getBikesForUser()) - called and awaited directly, same
// pattern as tests/components/CarsPage.test.tsx, whose own coverage this
// mirrors since the two pages are deliberate structural twins.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession: mockGetSession }));

const mockGetBikesForUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tracker/bike", () => ({ getBikesForUser: mockGetBikesForUser }));

const mockHeaders = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: mockHeaders }));

import MotorcyclesPage from "@/app/motorcycles/page";

describe("MotorcyclesPage", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetBikesForUser.mockReset();
    mockHeaders.mockReset();
    mockHeaders.mockResolvedValue({ get: () => null });
  });

  it("renders the marketing page for a signed-out visitor, CTA pointed at login with the addVehicle redirect", async () => {
    mockGetSession.mockResolvedValue(null);

    const jsx = await MotorcyclesPage();
    render(jsx);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/really costs/i);
    expect(mockGetBikesForUser).not.toHaveBeenCalled();
    const ctas = screen.getAllByRole("link", { name: /start tracking your bike free/i });
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/login?redirect=%2Fdashboard%3FaddVehicle%3Dbike");
    }
  });

  it("points the CTA at the add-bike flow for a signed-in visitor with no bike yet", async () => {
    mockGetSession.mockResolvedValue({ email: "rider@example.com" });
    mockGetBikesForUser.mockResolvedValue([]);

    const jsx = await MotorcyclesPage();
    render(jsx);

    const ctas = screen.getAllByRole("link", { name: /add your bike/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/dashboard?addVehicle=bike");
    }
  });

  it("points the CTA at the dashboard for a signed-in visitor who already has a bike, still forcing the bike view", async () => {
    mockGetSession.mockResolvedValue({ email: "rider@example.com" });
    mockGetBikesForUser.mockResolvedValue([{ id: "bike-1" }]);

    const jsx = await MotorcyclesPage();
    render(jsx);

    const ctas = screen.getAllByRole("link", { name: /go to your dashboard/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      // Not just "/dashboard" - a returning visitor who also has a car
      // needs addVehicle=bike preserved, or dashboard/page.tsx would fall
      // back to whatever kind their activeVehicleKind cookie remembers.
      expect(cta).toHaveAttribute("href", "/dashboard?addVehicle=bike");
    }
  });

  it("never links to the car-only tool pages", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await MotorcyclesPage();
    render(jsx);

    for (const href of ["/cars/quote-checker", "/cars/cost-calculator", "/cars/buying-guide"]) {
      const link = screen.queryByRole("link", { name: new RegExp(href) });
      if (link) expect(link).not.toHaveAttribute("href", href);
    }
  });

  it("links to its own three motorcycle tool pages", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await MotorcyclesPage();
    render(jsx);

    expect(screen.getByRole("link", { name: /quote checker/i })).toHaveAttribute("href", "/quote-checker");
    expect(screen.getByRole("link", { name: /cost calculator/i })).toHaveAttribute("href", "/cost-calculator");
    expect(screen.getByRole("link", { name: /buying guide/i })).toHaveAttribute("href", "/buying-guide");
  });

  it("links to the dedicated car hub for a signed-out visitor", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await MotorcyclesPage();
    render(jsx);

    expect(screen.getByRole("link", { name: /drive a car instead/i })).toHaveAttribute("href", "/cars");
  });

  // Plain "/dashboard" would fall back to whatever kind a signed-in
  // visitor's activeVehicleKind cookie remembers - forcing addVehicle=car
  // is what actually gets them to their car, the same reasoning as the
  // motorcycle-side ctaHref above.
  it("forces the car view for a signed-in visitor clicking 'Drive a car instead?'", async () => {
    mockGetSession.mockResolvedValue({ email: "rider@example.com" });
    mockGetBikesForUser.mockResolvedValue([{ id: "bike-1" }]);

    const jsx = await MotorcyclesPage();
    render(jsx);

    expect(screen.getByRole("link", { name: /drive a car instead/i })).toHaveAttribute(
      "href",
      "/dashboard?addVehicle=car"
    );
  });

  it("embeds the WebApplication JSON-LD script with the nonce read from request headers", async () => {
    mockGetSession.mockResolvedValue(null);
    mockHeaders.mockResolvedValue({ get: (key: string) => (key === "x-nonce" ? "test-nonce-123" : null) });

    const jsx = await MotorcyclesPage();
    const { container } = render(jsx);

    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBeGreaterThanOrEqual(1);
    for (const script of scripts) {
      expect(script.getAttribute("nonce")).toBe("test-nonce-123");
    }
    const webAppScript = Array.from(scripts).find((s) => JSON.parse(s.textContent ?? "{}")["@type"] === "WebApplication");
    expect(webAppScript).toBeDefined();
    const parsed = JSON.parse(webAppScript?.textContent ?? "{}");
    expect(parsed.name).toBe("RoadVerdict for motorcycles");
    expect(parsed.offers).toMatchObject({ price: "0", priceCurrency: "GBP" });
  });

  it("embeds a BreadcrumbList script pointed at the real /motorcycles URL", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await MotorcyclesPage();
    const { container } = render(jsx);

    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const breadcrumbScript = Array.from(scripts).find(
      (s) => JSON.parse(s.textContent ?? "{}")["@type"] === "BreadcrumbList"
    );
    expect(breadcrumbScript).toBeDefined();
    const parsed = JSON.parse(breadcrumbScript?.textContent ?? "{}");
    expect(parsed.itemListElement[1].item).toBe("https://roadverdict.co.uk/motorcycles");
  });

  it("degrades to anonymous if getSession() throws", async () => {
    mockGetSession.mockRejectedValue(new Error("cosmos down"));

    const jsx = await MotorcyclesPage();
    render(jsx);

    expect(mockGetBikesForUser).not.toHaveBeenCalled();
    expect(screen.getAllByRole("link", { name: /start tracking your bike free/i }).length).toBeGreaterThan(0);
  });

  it("renders all five feature cards", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await MotorcyclesPage();
    render(jsx);

    for (const title of ["Service history", "Fuel log", "Bills, fines & tolls", "Reminders that fire early", "Receipt scanning"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
