// Place at: src/app/guides/rebuild-lost-service-history/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free Guide · Motorcycles & Cars",
    "How to Rebuild a Lost Service History",
    "MOT history, garages, dealer records and your inbox - piece it back together in an afternoon."
  );
}
