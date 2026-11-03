// Place at: tests/components/TermsPage.test.tsx
//
// The terms name the trader, set the age rule, and say the same about the
// 14-day right to cancel as the line above Stripe's Pay button.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TermsPage from "@/app/terms/page";
import { HISTORY_CHECK_SUBMIT_MESSAGE, PRO_SUBMIT_MESSAGE } from "@/lib/payments/checkoutTerms";

describe("TermsPage", () => {
  it("names the trader and the contact address", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Terms of Service");
    expect(screen.getAllByText(/Tomasz Edward Pasierb, trading as RoadVerdict/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "hello@roadverdict.co.uk" })[0]).toHaveAttribute("href", "mailto:hello@roadverdict.co.uk");
  });

  it("sets the age rule: 16 to have an account, a parent's permission to buy under 18", () => {
    render(<TermsPage />);
    expect(screen.getByText(/16 or over/)).toBeInTheDocument();
    expect(screen.getByText(/under 18, you need a parent/)).toBeInTheDocument();
  });

  it("explains the right to cancel the way the checkouts do", () => {
    render(<TermsPage />);
    expect(screen.getByText(/lose the 14-day right to cancel once it has run/)).toBeInTheDocument();
    expect(HISTORY_CHECK_SUBMIT_MESSAGE).toMatch(/lose your right to cancel once it has run/);
    expect(screen.getByText(/within 14 days of your first payment/)).toBeInTheDocument();
    expect(PRO_SUBMIT_MESSAGE).toMatch(/within 14 days of your first payment/);
  });

  it("lists every section in its contents", () => {
    const { container } = render(<TermsPage />);
    const tocLinks = container.querySelectorAll("nav a");
    expect(tocLinks.length).toBe(16);
    for (const a of Array.from(tocLinks)) {
      expect(container.querySelector(a.getAttribute("href")!)).not.toBeNull();
    }
  });
});
