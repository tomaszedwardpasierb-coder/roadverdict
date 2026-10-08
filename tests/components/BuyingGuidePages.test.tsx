// Place at: tests/components/BuyingGuidePages.test.tsx
//
// The Buying Guide pages' FAQ: the FAQPage markup must match the visible
// questions (Google's rule), both pages carry the price and "included in
// Pro" answers, and the motorcycle page doesn't promise a valuation - the
// paid valuation is car-only.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/viewer/BuyingGuideFormsForViewer", () => ({
  BuyingGuideFormForViewer: () => <div data-testid="form" />,
  CarBuyingGuideFormForViewer: () => <div data-testid="form" />,
}));

import BikeBuyingGuidePage from "@/app/buying-guide/page";
import CarBuyingGuidePage from "@/app/cars/buying-guide/page";
import { REPORT_PRICING_FAQ } from "@/lib/seo/reportPricingCopy";

function faqMarkup(container: HTMLElement): { name: string; text: string }[] {
  const scripts = Array.from(container.querySelectorAll('script[type="application/ld+json"]'));
  const faq = scripts.map((s) => JSON.parse(s.textContent ?? "{}")).find((j) => j["@type"] === "FAQPage");
  return faq.mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => ({ name: q.name, text: q.acceptedAnswer.text }));
}

describe.each([
  ["motorcycle", BikeBuyingGuidePage],
  ["car", CarBuyingGuidePage],
])("%s Buying Guide page FAQ", (kind, Page) => {
  it("marks up exactly the questions it shows, including the two pricing ones", () => {
    const { container } = render(<Page />);
    const marked = faqMarkup(container);
    const shown = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    // Apostrophe style differs between the markup and the page on older questions; the words match.
    const plain = (s: string | null) => (s ?? "").replace(/’/g, "'");
    expect(marked.map((q) => plain(q.name))).toEqual(shown.map(plain));
    for (const f of REPORT_PRICING_FAQ) {
      expect(marked.map((q) => q.name)).toContain(f.question);
      expect(marked.find((q) => q.name === f.question)?.text).toBe(f.answer);
      expect(screen.getByText(f.answer)).toBeInTheDocument();
    }
  });

  it(`${kind === "car" ? "keeps" : "doesn't make"} a valuation claim about the paid check`, () => {
    const { container } = render(<Page />);
    const paid = faqMarkup(container).find((q) => /history in more depth/i.test(q.name))!;
    if (kind === "car") {
      // Cars: the free briefing has an estimated valuation; the paid check text is unchanged.
      expect(paid.text).toMatch(/stolen marker/);
    } else {
      expect(paid.text).toMatch(/stolen marker, write-off history and outstanding finance/);
      expect(paid.text).not.toMatch(/valuation/i);
    }
  });
});
