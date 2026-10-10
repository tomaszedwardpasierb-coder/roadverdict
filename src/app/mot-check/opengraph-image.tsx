// Place at: src/app/mot-check/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free · Motorcycles & Cars · No Account",
    "Free MOT History Check",
    "Every advisory and failure explained in plain English, an MOT score, and what common repairs cost."
  );
}
