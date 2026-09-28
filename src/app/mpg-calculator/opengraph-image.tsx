// Place at: src/app/mpg-calculator/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free MPG Calculator · Cars & Motorcycles",
    "What Does It Really Do to the Gallon?",
    "Your real MPG or L/100km from one tank - and what every mile costs you in fuel."
  );
}
