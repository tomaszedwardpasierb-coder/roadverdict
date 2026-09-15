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
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const metadata: Metadata = {
  title: 'Guides - Buying and Owning a Motorcycle or Car',
  description:
    'Free, UK-specific guides on buying a used motorcycle or car, and what either actually costs to own - written for each vehicle type specifically.',
  alternates: { canonical: '/guides' },
};

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
    </div>
  );
}
