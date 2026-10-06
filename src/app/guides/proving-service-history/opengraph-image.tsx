// Place at: src/app/guides/proving-service-history/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free Guide · Motorcycles & Cars",
    "How to Prove Your Service History When You Sell",
    "What counts as proof, what buyers check, and what never to share."
  );
}
