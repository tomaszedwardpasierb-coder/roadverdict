// Place at: src/lib/seo/pageMetadata.ts
//
// Builds a public page's metadata: title, description, canonical URL, and
// the Open Graph / Twitter tags that link previews (Facebook, WhatsApp,
// LinkedIn, Reddit, X) are built from.
//
// Why every page needs its own share tags (found 2026-09-26): the root
// layout's openGraph/twitter block - with the homepage's title,
// description and og:url - was the only one in the app, and a page that
// doesn't set its own inherits the layout's. So every page on the site
// told Facebook it *was* the homepage: a car quote-checker link shared in
// a group previewed with the homepage's text, and Facebook, which treats
// og:url as the canonical address, credited the share to the homepage.
// The share image was already right per page - it comes from each
// segment's own opengraph-image.tsx, which this doesn't touch.
import type { Metadata } from 'next';

export const SITE_NAME = 'RoadVerdict';
export const SITE_ORIGIN = 'https://roadverdict.co.uk';

export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: {
  title: string;
  description: string;
  // Site-relative, e.g. '/cars/quote-checker'.
  path: string;
  // For the few titles that already carry the brand (the homepage, Pro),
  // so the layout's " | RoadVerdict" template isn't appended a second time.
  absoluteTitle?: boolean;
}): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  const url = `${SITE_ORIGIN}${path === '/' ? '' : path}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { title: fullTitle, description, url, siteName: SITE_NAME, locale: 'en_GB', type: 'website' },
    twitter: { card: 'summary_large_image', title: fullTitle, description },
  };
}
