// Place at: src/app/robots.ts
//
// The single source of truth for robots.txt - a static public/robots.txt
// used to exist alongside this file, and Next.js silently served that one
// instead of this route (confirmed live: production's actual robots.txt
// was the stale static file, missing /report/, /car-report/, /tomasz,
// /garage, and the transfer/token pages entirely - this dynamic file was
// dead code the whole time it existed). Deleted that file rather than
// keeping two lists that can drift - this is the only one now.
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: [
          "/login",
          "/dashboard",
          "/garage",
          "/tomasz",
          "/report/",
          "/car-report/",
          "/bike-transfer/",
          "/car-transfer/",
          "/privacy-draft",
          "/api/",
        ],
      },
    ],
    sitemap: "https://roadverdict.co.uk/sitemap.xml",
  };
}
