// Place at: src/app/guides/page.tsx
//
// The /guides hub - previously there was no long-form content anywhere on
// the site at all (SEO_STRATEGY.md's single biggest flagged gap), just
// tools. Track 2's cornerstone guides live here. Deliberately genuine,
// separately-written motorcycle and car versions of each topic, not one
// article with the vehicle word swapped - the whole site's Pillar 4 is
// that motorcycles are a first-class vehicle type, not a footnote, and a
// shared "vehicle" guide would undercut that same claim right here.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';
import { PRICE_GUIDES, formatPounds, overallRange, priceGuideHubPath, priceGuidePath } from '@/lib/seo/priceGuides';

export const metadata: Metadata = pageMetadata({
  title: 'Motorcycle & Car Guides and Price Guides (UK)',
  description:
    'Free, UK-specific guides on buying a used motorcycle or car and what either costs to own, plus sourced price guides for servicing, tyres, brakes and the MOT.',
  path: '/guides',
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Guides', '/guides');

const GUIDES = [
  {
    href: '/guides/buying-a-used-motorcycle',
    title: 'What to Check Before Buying a Used Motorcycle',
    description: 'The paperwork, the mechanical checks, and the questions to ask before you hand over any money.',
  },
  {
    href: '/guides/buying-a-used-car',
    title: 'What to Check Before Buying a Used Car',
    description: 'The paperwork, the mechanical checks, and the questions to ask before you hand over any money.',
  },
  {
    href: '/guides/cost-of-owning-a-motorcycle',
    title: 'The Real Cost of Owning a Motorcycle in the UK',
    description: 'Fuel, insurance, tax, servicing and depreciation - the full picture, not just the price on the forecourt.',
  },
  {
    href: '/guides/cost-of-owning-a-car',
    title: 'The Real Cost of Owning a Car in the UK',
    description: 'Fuel, insurance, tax, servicing and depreciation - the full picture, not just the price on the forecourt.',
  },
] as const;

export default function GuidesPage() {
  return (
    <div className="hero">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <h1>Guides</h1>
      <p style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        Free, UK-specific guides - not a generic template with &quot;vehicle&quot; swapped for
        the word you searched. Motorcycles and cars each get their own version, written for how
        that vehicle actually works.
      </p>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {GUIDES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            style={{
              display: 'block',
              padding: '1rem 1.2rem',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <strong style={{ display: 'block', marginBottom: '0.3rem' }}>{g.title}</strong>
            <span style={{ color: 'var(--ink-soft)', fontSize: '0.9rem' }}>{g.description}</span>
          </Link>
        ))}
      </div>

      {(['motorcycle', 'car'] as const).map((vehicle) => (
        <section key={vehicle} aria-labelledby={`prices-${vehicle}`} style={{ marginTop: '2.5rem' }}>
          <h2 id={`prices-${vehicle}`} style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.4rem' }}>
            {vehicle === 'car' ? 'Car' : 'Motorcycle'} price guides
          </h2>
          <p style={{ maxWidth: 'none', margin: '0 0 1rem' }}>
            What common {vehicle} jobs typically cost in the UK, from named sources.{' '}
            <Link href={priceGuideHubPath(vehicle)}>All {vehicle} price guides</Link>
          </p>
          <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))' }}>
            {PRICE_GUIDES[vehicle].map((g) => {
              const range = overallRange(g);
              return (
                <Link
                  key={g.slug}
                  href={priceGuidePath(g)}
                  style={{
                    display: 'block',
                    padding: '0.9rem 1.1rem',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{g.name}</strong>
                  <span style={{ color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
                    {g.kind === 'mot' ? `Up to ${formatPounds(range.high)}` : `${formatPounds(range.low)} - ${formatPounds(range.high)}`}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
