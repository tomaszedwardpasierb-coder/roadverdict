// Place at: tests/components/SocialLinks.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SocialLinks } from "@/components/SocialLinks";

describe("SocialLinks", () => {
  it("links to the real Facebook, Instagram, and TikTok pages, each opening in a new tab", () => {
    render(<SocialLinks />);

    const facebook = screen.getByRole("link", { name: "RoadVerdict on Facebook" });
    expect(facebook).toHaveAttribute("href", "https://www.facebook.com/profile.php?id=61594142271284");
    expect(facebook).toHaveAttribute("target", "_blank");
    expect(facebook).toHaveAttribute("rel", "noopener noreferrer");

    const instagram = screen.getByRole("link", { name: "RoadVerdict on Instagram" });
    expect(instagram).toHaveAttribute("href", "https://www.instagram.com/RoadVerdict.web");

    const tiktok = screen.getByRole("link", { name: "RoadVerdict on TikTok" });
    expect(tiktok).toHaveAttribute("href", "https://www.tiktok.com/@roadverdict");
  });
});
