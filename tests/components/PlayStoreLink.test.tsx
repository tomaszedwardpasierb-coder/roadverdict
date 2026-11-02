// The quiet Google Play line: tagged per placement, and never shown on
// iPhones or iPads, which have no RoadVerdict app.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { isAppleMobile, PlayStoreLink } from "@/components/PlayStoreLink";
import { playStoreUrl } from "@/lib/playStore";

afterEach(() => vi.restoreAllMocks());

describe("playStoreUrl", () => {
  it("points at the app with the placement in the referrer", () => {
    const url = new URL(playStoreUrl("email", "footer"));
    expect(url.searchParams.get("id")).toBe("uk.co.roadverdict.app");
    expect(url.searchParams.get("referrer")).toBe("utm_source=email&utm_campaign=footer");
  });
});

describe("isAppleMobile", () => {
  it("spots iPhones and iPads (including iPadOS posing as a Mac), not Android or desktops", () => {
    expect(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isAppleMobile("Mozilla/5.0 (Linux; Android 15; Pixel 7)")).toBe(false);
    expect(isAppleMobile("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});

describe("PlayStoreLink", () => {
  it("shows the tagged link on Android and desktops", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 15; Pixel 7)");
    render(<PlayStoreLink campaign="mot-check" lead="On Android?" label="Get the app" />);
    const link = await screen.findByRole("link", { name: "Get the app" });
    expect(link.getAttribute("href")).toBe(playStoreUrl("website", "mot-check"));
    expect(screen.getByText(/On Android\?/)).toBeInTheDocument();
  });

  it("shows nothing on an iPhone", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    const { container } = render(<PlayStoreLink campaign="footer" label="Get the app" />);
    expect(container).toBeEmptyDOMElement();
  });
});
