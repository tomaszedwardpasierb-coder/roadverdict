// Place at: tests/components/GuidesIndexPage.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GuidesPage from "@/app/guides/page";

describe("GuidesPage", () => {
  it("links to all seven guides", () => {
    render(<GuidesPage />);

    expect(screen.getByRole("link", { name: /What to Check Before Buying a Used Motorcycle/ })).toHaveAttribute(
      "href",
      "/guides/buying-a-used-motorcycle"
    );
    expect(screen.getByRole("link", { name: /What to Check Before Buying a Used Car/ })).toHaveAttribute(
      "href",
      "/guides/buying-a-used-car"
    );
    expect(screen.getByRole("link", { name: /The Real Cost of Owning a Motorcycle/ })).toHaveAttribute(
      "href",
      "/guides/cost-of-owning-a-motorcycle"
    );
    expect(screen.getByRole("link", { name: /The Real Cost of Owning a Car/ })).toHaveAttribute(
      "href",
      "/guides/cost-of-owning-a-car"
    );
    expect(screen.getByRole("link", { name: /Motorcycle Road Tax/ })).toHaveAttribute("href", "/guides/motorcycle-road-tax");
    expect(screen.getByRole("link", { name: /How to Prove Your Service History/ })).toHaveAttribute(
      "href",
      "/guides/proving-service-history"
    );
    expect(screen.getByRole("link", { name: /How to Rebuild a Lost Service History/ })).toHaveAttribute(
      "href",
      "/guides/rebuild-lost-service-history"
    );
  });

  it("embeds a BreadcrumbList script pointed at the real /guides URL", () => {
    const { container } = render(<GuidesPage />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const parsed = JSON.parse(script?.textContent ?? "{}");
    expect(parsed["@type"]).toBe("BreadcrumbList");
    expect(parsed.itemListElement[1].item).toBe("https://roadverdict.co.uk/guides");
  });
});
