// Place at: src/app/privacy/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Privacy",
    "Your Data, Plainly",
    "What RoadVerdict stores, why, and how to export your records or delete your account."
  );
}
