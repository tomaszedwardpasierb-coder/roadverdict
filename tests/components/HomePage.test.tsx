// Place at: tests/components/HomePage.test.tsx
//
// HomePage is an async Server Component (calls getSession(), headers()),
// so it's called and awaited directly rather than passed to render() -
// RTL's render() expects a component, not a function returning a Promise
// of one. redirect() genuinely throws in real Next.js to unwind
// rendering, so the mock replicates that rather than just recording a
// call - a test that only checked "redirect was called" could still
// pass against code that kept rendering (and erroring on missing
// session data) right afterward.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockRedirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession: mockGetSession }));

const mockHeaders = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: mockHeaders }));

import HomePage from "@/app/page";

describe("HomePage", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    mockGetSession.mockReset();
    mockHeaders.mockReset();
    mockHeaders.mockResolvedValue({ get: () => null });
  });

  it("redirects to the dashboard for an already signed-in visitor, rendering nothing further", async () => {
    mockGetSession.mockResolvedValue({ email: "rider@example.com" });
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("renders the marketing homepage for a signed-out visitor", async () => {
    mockGetSession.mockResolvedValue(null);

    const jsx = await HomePage();
    render(jsx);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/really costs/i);
    expect(screen.getAllByRole("link", { name: /start logging your motorcycle/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /start logging your car/i }).length).toBeGreaterThan(0);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("embeds the WebApplication JSON-LD script with the nonce read from request headers", async () => {
    mockGetSession.mockResolvedValue(null);
    mockHeaders.mockResolvedValue({ get: (key: string) => (key === "x-nonce" ? "test-nonce-123" : null) });

    const jsx = await HomePage();
    const { container } = render(jsx);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    expect(script?.getAttribute("nonce")).toBe("test-nonce-123");
    const parsed = JSON.parse(script?.textContent ?? "{}");
    expect(parsed["@type"]).toBe("WebApplication");
    expect(parsed.name).toBe("RoadVerdict");
    expect(parsed.offers).toMatchObject({ price: "0", priceCurrency: "GBP" });
  });

  it("renders all four 'problems' cards", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await HomePage();
    render(jsx);

    expect(screen.getByText("The quote you can't verify")).toBeInTheDocument();
    expect(screen.getByText("The receipt you can't find")).toBeInTheDocument();
    expect(screen.getByText("The cost you never added up")).toBeInTheDocument();
    expect(screen.getByText("The buy you'll regret")).toBeInTheDocument();
  });

  it("renders every solution card heading", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await HomePage();
    render(jsx);

    for (const title of ["Quote checker", "Full history log", "Buying guide", "True running cost", "Sell with proof", "Smart reminders"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  // Straight to the correct add-vehicle flow, not a marketing-page
  // detour that then asks the visitor to "start logging" a second time -
  // see dashboard/page.tsx's addVehicle handling, which forces this exact
  // kind once signed in, regardless of any activeVehicleKind cookie.
  it("links every 'Start logging your motorcycle' CTA to the bike add-vehicle flow", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await HomePage();
    render(jsx);

    const ctaLinks = screen.getAllByRole("link", { name: /start logging your motorcycle/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    for (const link of ctaLinks) {
      expect(link).toHaveAttribute("href", "/login?redirect=%2Fdashboard%3FaddVehicle%3Dbike");
    }
  });

  it("links every 'Start logging your car' CTA to the car add-vehicle flow", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await HomePage();
    render(jsx);

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
  it("links the Quote checker, Buying guide, and True running cost solution cards to their own tool pages", async () => {
    mockGetSession.mockResolvedValue(null);
    const jsx = await HomePage();
    render(jsx);

    expect(screen.getByRole("link", { name: /quote checker/i })).toHaveAttribute("href", "/quote-checker");
    expect(screen.getByRole("link", { name: /buying guide/i })).toHaveAttribute("href", "/buying-guide");
    expect(screen.getByRole("link", { name: /true running cost/i })).toHaveAttribute("href", "/cost-calculator");
  });
});
