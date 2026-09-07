import Link from 'next/link';

const TOOLS = [
  { href: '/cars/quote-checker', label: 'Quote Checker', blurb: 'Is your service quote fair?' },
  { href: '/cars/cost-calculator', label: 'Cost Calculator', blurb: 'What does it actually cost you a year?' },
  { href: '/cars/buying-guide', label: 'Buying Guide', blurb: 'What to check before you buy' },
] as const;

// Car equivalent of RelatedTools.tsx - that component's TOOLS/current
// union is hardcoded to the motorcycle URLs, so it can't be reused
// directly. Same in-content-links-between-the-three-tools pattern.
export function CarRelatedTools({ current }: { current: (typeof TOOLS)[number]['href'] }) {
  const others = TOOLS.filter((t) => t.href !== current);
  return (
    <nav className="rv-related-tools" aria-label="Other free tools for cars">
      <p className="rv-related-tools__eyebrow">Also free</p>
      <div className="rv-related-tools__row">
        {others.map((t) => (
          <Link key={t.href} href={t.href} className="rv-related-tools__link">
            <strong>{t.label}</strong>
            <span>{t.blurb}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
