// A club's member offer page (/club/<code>): what each visitor sees, and
// that it stays out of search results.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const notFoundMock = vi.hoisted(() => vi.fn(() => { throw new Error("NOT_FOUND"); }));
const getSessionMock = vi.hoisted(() => vi.fn());
const isProMock = vi.hoisted(() => vi.fn());
const getUserDocMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/auth/session", () => ({ getSession: getSessionMock }));
vi.mock("@/lib/subscriptions", () => ({ isPro: isProMock, PRO_MONTHLY_PRICE: "£5.99" }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: getUserDocMock }));

import ClubOfferPage, { generateMetadata } from "@/app/club/[code]/page";

const params = (code: string) => ({ params: Promise.resolve({ code }) });

async function renderPage(code: string) {
  render(await ClubOfferPage(params(code)));
}

afterEach(() => {
  getSessionMock.mockReset();
  isProMock.mockReset();
  getUserDocMock.mockReset();
});

describe("Club offer page", () => {
  it("is a 404 for an unknown club code", async () => {
    await expect(ClubOfferPage(params("nope"))).rejects.toThrow("NOT_FOUND");
  });

  it("is kept out of search results", async () => {
    const meta = await generateMetadata(params("docgb"));
    expect(meta.title).toBe("RoadVerdict Pro for members of the Ducati Owners Club GB");
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("sets out the offer and sends a signed-out visitor to sign in and straight back", async () => {
    getSessionMock.mockResolvedValue(null);
    await renderPage("DOCGB");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("RoadVerdict Pro for members of the Ducati Owners Club GB");
    expect(screen.getByText(/3 months \(90 days\) of Pro free\./)).toBeInTheDocument();
    expect(screen.getByText(/£5\.39 a month or £53\.10 a year, instead of £5\.99 or £59/)).toBeInTheDocument();
    expect(screen.getByText(/The full history check for £9\.99/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in or create a free account" })).toHaveAttribute(
      "href",
      "/login?redirect=%2Fclub%2Fdocgb&src=partner"
    );
    expect(screen.queryByRole("button", { name: /Start 3 months free/ })).toBeNull();
  });

  it("offers a signed-in new member the 3 free months", async () => {
    getSessionMock.mockResolvedValue({ email: "rider@example.com" });
    isProMock.mockResolvedValue(false);
    getUserDocMock.mockResolvedValue({ email: "rider@example.com" });
    await renderPage("mag");
    expect(screen.getByRole("button", { name: "Start 3 months free - then £5.39/mo" })).toBeInTheDocument();
  });

  it("tells someone who had Pro before that only the 10% applies", async () => {
    getSessionMock.mockResolvedValue({ email: "rider@example.com" });
    isProMock.mockResolvedValue(false);
    getUserDocMock.mockResolvedValue({ email: "rider@example.com", stripeCustomerId: "cus_1" });
    await renderPage("mag");
    expect(screen.getByText(/the free months don.t apply, but the 10% off does/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subscribe monthly - £5.39/mo (10% off)" })).toBeInTheDocument();
  });

  it("has nothing to claim for an account that already has Pro", async () => {
    getSessionMock.mockResolvedValue({ email: "rider@example.com" });
    isProMock.mockResolvedValue(true);
    getUserDocMock.mockResolvedValue({ email: "rider@example.com" });
    await renderPage("docgb");
    expect(screen.getByText(/already has Pro, so there.s nothing to claim/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start|Subscribe/ })).toBeNull();
  });
});
