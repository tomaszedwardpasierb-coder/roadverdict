// Place at: src/components/RelatedTools.tsx
import Link from 'next/link';

const TOOLS = [
  { href: '/quote-checker', label: 'Quote Checker', blurb: 'Is your service quote fair?', carHref: '/cars/quote-checker' },
  { href: '/cost-calculator', label: 'Cost Calculator', blurb: 'What does it actually cost you a year?', carHref: '/cars/cost-calculator' },
  { href: '/buying-guide', label: 'Buying Guide', blurb: 'What to check before you buy', carHref: '/cars/buying-guide' },
] as const;

// Real, in-content links between the three public tool pages - not just
// the header nav. Each page excludes itself via `current` rather than
// linking to its own URL. Deliberately plain <Link>s, not another
// WebApplication/JSON-LD block - schema.org markup for these tools
// already lives on their own pages (see each page's own jsonLd
// constant); duplicating it here would just be noise.
//
// Also links to the price guides and to the same tool for cars: the car
// tools used to be reachable only from the homepage-less /cars hub, so a
// car owner who landed on a motorcycle tool had no way across - and search
// engines had almost no internal links pointing at the car pages.
export function RelatedTools({ current }: { current: (typeof TOOLS)[number]['href'] }) {
  const others = TOOLS.filter((t) => t.href !== current);
  const twin = TOOLS.find((t) => t.href === current);
  return (
    <nav className="rv-related-tools" aria-label="Other free tools">
      <p className="rv-related-tools__eyebrow">Also free</p>
      <div className="rv-related-tools__row">
        {others.map((t) => (
          <Link key={t.href} href={t.href} className="rv-related-tools__link">
            <strong>{t.label}</strong>
            <span>{t.blurb}</span>
          </Link>
        ))}
        <Link href="/motorcycles/costs" className="rv-related-tools__link">
          <strong>Price guides</strong>
          <span>What common motorcycle jobs cost</span>
        </Link>
      </div>
      {twin ? (
        <p className="rv-related-tools__switch">
          Got a car instead? <Link href={twin.carHref}>Car {twin.label.toLowerCase()}</Link>
        </p>
      ) : null}
    </nav>
  );
}
