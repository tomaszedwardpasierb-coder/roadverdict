import Link from 'next/link';

const TOOLS = [
  { href: '/cars/quote-checker', label: 'Quote Checker', blurb: 'Is your service quote fair?', bikeHref: '/quote-checker' },
  { href: '/cars/cost-calculator', label: 'Cost Calculator', blurb: 'What does it actually cost you a year?', bikeHref: '/cost-calculator' },
  { href: '/cars/buying-guide', label: 'Buying Guide', blurb: 'What to check before you buy', bikeHref: '/buying-guide' },
] as const;

// Car equivalent of RelatedTools.tsx - that component's TOOLS/current
// union is hardcoded to the motorcycle URLs, so it can't be reused
// directly. Same in-content-links-between-the-three-tools pattern, plus
// the car price guides and the same tool for motorcycles.
export function CarRelatedTools({ current }: { current: (typeof TOOLS)[number]['href'] }) {
  const others = TOOLS.filter((t) => t.href !== current);
  const twin = TOOLS.find((t) => t.href === current);
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
        <Link href="/cars/costs" className="rv-related-tools__link">
          <strong>Price guides</strong>
          <span>What common car jobs cost</span>
        </Link>
      </div>
      {twin ? (
        <p className="rv-related-tools__switch">
          Got a motorcycle instead? <Link href={twin.bikeHref}>Motorcycle {twin.label.toLowerCase()}</Link>
        </p>
      ) : null}
    </nav>
  );
}
