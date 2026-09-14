// Place at: src/app/opengraph-image.tsx
// Next's file-convention OG image for the site root - auto-wired into
// every page's og:image/twitter:image unless that page's own segment
// defines its own opengraph-image.tsx (see quote-checker, cost-calculator,
// buying-guide, each × bike/car).
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free · UK · Motorcycles & Cars",
    "Know What Your Vehicle Really Costs",
    "Check if a quote is fair, track real running costs, and prove your vehicle's history when you sell."
  );
}
