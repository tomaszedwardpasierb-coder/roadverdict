// Place at: src/lib/seo/breadcrumbs.ts
//
// BreadcrumbList JSON-LD builder shared by every tool page - before this,
// no page anywhere carried BreadcrumbList schema at all. Kept intentionally
// tiny: every tool page's own breadcrumb is just Home -> this page, since
// none of them sit more than one level deep in the site's real navigation.
export function buildBreadcrumbJsonLd(pageName: string, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://roadverdict.co.uk/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: pageName,
        item: `https://roadverdict.co.uk${path}`,
      },
    ],
  };
}
