// Place at: src/app/buying-guide/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free Buying Guide · Motorcycles",
    "Buying a Used Motorcycle?",
    "Full official MOT history, an AI-written briefing, and what to check before you hand over money."
  );
}
