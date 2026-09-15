// Place at: src/app/guides/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free Guides · UK",
    "Real Answers, Not Generic Advice",
    "Buying a used vehicle, working out what it'll really cost - written for motorcycles and cars specifically, not a car guide with the word swapped."
  );
}
