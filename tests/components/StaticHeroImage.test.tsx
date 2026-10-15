// The hero pictures are served from ready-made files, never through
// /_next/image (whose per-deploy cache made the first visitors after every
// restart wait minutes for one resize on a single small server).
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StaticHeroImage } from "@/components/StaticHeroImage";

describe("StaticHeroImage", () => {
  it("points straight at the ready-made files, with a srcSet and the largest as the fallback", () => {
    const { container } = render(<StaticHeroImage base="/images/hero/panel-04" widths={[640, 896]} sizes="100vw" alt="A panel" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/images/hero/panel-04-896.webp");
    expect(img.getAttribute("srcset")).toBe("/images/hero/panel-04-640.webp 640w, /images/hero/panel-04-896.webp 896w");
    expect(img.getAttribute("src")).not.toContain("_next/image");
    expect(img.getAttribute("alt")).toBe("A panel");
    expect(img.style.objectFit).toBe("cover");
  });

  it("loads lazily and decodes off-thread unless it's the priority image", () => {
    const { container } = render(<StaticHeroImage base="/x" widths={[640]} sizes="100vw" alt="" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
  });

  it("loads the priority (above-the-fold) image eagerly and first", () => {
    const { container } = render(<StaticHeroImage base="/x" widths={[640]} sizes="100vw" alt="" priority objectPosition="38% center" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.style.objectPosition).toBe("38% center");
  });
});
