// Place at: tests/components/CarsPage.test.tsx
//
// CarsPage is an async Server Component (calls getSession(), headers(),
// getCarsForUser()) - called and awaited directly, same pattern as
// tests/components/HomePage.test.tsx.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession: mockGetSession }));

const mockGetCarsForUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tracker/car", () => ({ getCarsForUser: mockGetCarsForUser }));

const mockHeaders = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: mockHeaders }));

import CarsPage from "@/app/cars/page";

describe("CarsPage", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetCarsForUser.mockReset();
    mockHeaders.mockReset();
    mockHeaders.mockResolvedValue({ get: () => null });
  });

  it("renders the marketing page for a signed-out visitor, CTA pointed at login with the addVehicle redirect", async () => {
    mockGetSession.mockResolvedValue(null);

    const jsx = await CarsPage();
    render(jsx);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/really costs/i);
    expect(mockGetCarsForUser).not.toHaveBeenCalled();
    const ctas = screen.getAllByRole("link", { name: /start tracking your car free/i });
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/login?redirect=%2Fdashboard%3FaddVehicle%3Dcar");
    }
  });

  it("points the CTA at the add-car flow for a signed-in visitor with no car yet", async () => {
    mockGetSession.mockResolvedValue({ email: "driver@example.com" });
    mockGetCarsForUser.mockResolvedValue([]);

    const jsx = await CarsPage();
    render(jsx);

    const ctas = screen.getAllByRole("link", { name: /add your car/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/dashboard?addVehicle=car");
    }
  });

  it("points the CTA at the dashboard for a signed-in visitor who already has a car", async () => {
    mockGetSession.mockResolvedValue({ email: "driver@example.com" });
    mockGetCarsForUser.mockResolvedValue([{ id: "car-1" }]);

    const jsx = await CarsPage();
    render(jsx);

    const ctas = screen.getAllByRole("link", { name: /go to your dashboard/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/dashboard");
    }
  });

  it("never links to the motorcycle-only tool pages", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await CarsPage();
    render(jsx);

    for (const href of ["/quote-checker", "/cost-calculator", "/buying-guide"]) {
      const link = screen.queryByRole("link", { name: new RegExp(href) });
      // A link to the /cars/ prefixed version legitimately matches this
      // same regex (no leading anchor) - only reject an exact, un-prefixed
      // motorcycle URL.
      if (link) expect(link).not.toHaveAttribute("href", href);
    }
  });

  it("links to its own three car tool pages (Phase 7 - built once car price research landed)", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await CarsPage();
    render(jsx);

    expect(screen.getByRole("link", { name: /quote checker/i })).toHaveAttribute("href", "/cars/quote-checker");
    expect(screen.getByRole("link", { name: /cost calculator/i })).toHaveAttribute("href", "/cars/cost-calculator");
    expect(screen.getByRole("link", { name: /buying guide/i })).toHaveAttribute("href", "/cars/buying-guide");
  });

  it("links back to the motorcycle homepage", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await CarsPage();
    render(jsx);

    expect(screen.getByRole("link", { name: /ride a motorcycle instead/i })).toHaveAttribute("href", "/");
  });

  it("embeds the WebApplication JSON-LD script with the nonce read from request headers", async () => {
    mockGetSession.mockResolvedValue(null);
    mockHeaders.mockResolvedValue({ get: (key: string) => (key === "x-nonce" ? "test-nonce-123" : null) });

    const jsx = await CarsPage();
    const { container } = render(jsx);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    expect(script?.getAttribute("nonce")).toBe("test-nonce-123");
    const parsed = JSON.parse(script?.textContent ?? "{}");
    expect(parsed["@type"]).toBe("WebApplication");
    expect(parsed.name).toBe("RoadVerdict for cars");
    expect(parsed.offers).toMatchObject({ price: "0", priceCurrency: "GBP" });
  });

  it("degrades to anonymous if getSession() throws", async () => {
    mockGetSession.mockRejectedValue(new Error("cosmos down"));

    const jsx = await CarsPage();
    render(jsx);

    expect(mockGetCarsForUser).not.toHaveBeenCalled();
    expect(screen.getAllByRole("link", { name: /start tracking your car free/i }).length).toBeGreaterThan(0);
  });

  it("renders all five feature cards", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await CarsPage();
    render(jsx);

    for (const title of ["Service history", "Fuel log", "Bills & MOT", "Reminders that fire early", "Receipt scanning"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
