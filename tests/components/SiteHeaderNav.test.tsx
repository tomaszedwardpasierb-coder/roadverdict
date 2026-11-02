// Place at: tests/components/SiteHeaderNav.test.tsx
//
// The header's two key links - the free MOT check and the paid history
// check - must be on every page, and stay out from behind the menu button
// on a phone (their own row, rendered alongside the desktop row and shown
// by CSS). The history check follows the page: bike pages open the bike
// version, everything else the car one.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { SiteHeaderNav } from "@/app/SiteHeaderNav";

function keyRow() {
  return within(screen.getByRole("navigation", { name: "Checks" }));
}

describe("SiteHeaderNav", () => {
  it("leads the desktop row with MOT Check and History Check", () => {
    nav.pathname = "/";
    render(<SiteHeaderNav />);
    const links = within(screen.getByRole("navigation", { name: "Site" })).getAllByRole("link");
    expect(links[0]).toHaveTextContent("MOT Check");
    expect(links[0]).toHaveAttribute("href", "/mot-check");
    expect(links[1]).toHaveTextContent("History Check");
  });

  it("gives the two checks their own row outside the menu button", () => {
    nav.pathname = "/";
    render(<SiteHeaderNav />);
    expect(keyRow().getByRole("link", { name: "MOT Check" })).toHaveAttribute("href", "/mot-check");
    expect(keyRow().getByRole("link", { name: "History Check" })).toBeInTheDocument();
  });

  it("opens the car history check from the homepage and car pages", () => {
    for (const path of ["/", "/cars", "/cars/costs/brake-pads", "/mot-check"]) {
      nav.pathname = path;
      const { unmount } = render(<SiteHeaderNav />);
      expect(keyRow().getByRole("link", { name: "History Check" }), path).toHaveAttribute("href", "/cars/buying-guide");
      unmount();
    }
  });

  it("opens the bike history check from motorcycle pages", () => {
    for (const path of ["/motorcycles", "/motorcycles/costs", "/buying-guide", "/quote-checker", "/guides/motorcycle-road-tax"]) {
      nav.pathname = path;
      const { unmount } = render(<SiteHeaderNav />);
      expect(keyRow().getByRole("link", { name: "History Check" }), path).toHaveAttribute("href", "/buying-guide");
      unmount();
    }
  });
});
