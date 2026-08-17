// Place at: src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: ["/report/", "/dashboard", "/garage", "/tomasz", "/privacy-draft"],
      },
    ],
  };
}
