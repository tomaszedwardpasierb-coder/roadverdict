// Place at: src/app/motorcycles/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free · UK · Motorcycles",
    "Know What Your Motorcycle Really Costs",
    "Log every service, fuel fill, and bill. Reminders fire before your MOT or insurance lapses, not after."
  );
}
