// Place at: src/lib/og/ogImage.tsx
//
// Shared 1200x630 template every opengraph-image.tsx route renders through -
// before this, zero Open Graph/Twitter Card images existed anywhere in the
// app, so every link shared on WhatsApp/iMessage/Slack/LinkedIn/X rendered
// with no image at all. One template, parameterised by kicker/title/detail,
// rather than six near-identical ImageResponse trees - colours pulled
// straight from globals.css's own custom properties so this actually looks
// like RoadVerdict rather than a generic OG-image-generator default.
import { ImageResponse } from "next/og";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_IMAGE_CONTENT_TYPE = "image/png";

const ASPHALT = "#17181B";
const STONE = "#F3F1EC";
const AMBER = "#EE9A2E";
const INK_SOFT = "#54555A";

export function renderOgImage(kicker: string, title: string, detail: string): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 88px",
          backgroundColor: ASPHALT,
          color: STONE,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: AMBER,
            marginBottom: 28,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.08,
            maxWidth: 980,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: INK_SOFT,
            marginTop: 32,
            maxWidth: 900,
          }}
        >
          {detail}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 700,
            color: STONE,
            marginTop: 56,
          }}
        >
          RoadVerdict
        </div>
      </div>
    ),
    { ...OG_IMAGE_SIZE }
  );
}
