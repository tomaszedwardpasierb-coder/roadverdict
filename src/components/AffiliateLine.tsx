// One quiet line of affiliate links - see lib/affiliates.ts for the house
// rules (text only, labelled, rel="sponsored", at most two links). Plain
// markup with no hooks, so it works in server and client components alike.
import type { AffiliateLink } from '@/lib/affiliates';

export function AffiliateLine({ lead, links }: { lead: string; links: AffiliateLink[] }) {
  if (links.length === 0) return null;
  return (
    <p className="rv-affiliate">
      {lead}{' '}
      {links.map((link, i) => (
        <span key={link.href}>
          {i > 0 ? ' · ' : ''}
          <a
            href={link.href}
            target="_blank"
            rel="sponsored nofollow noopener"
            aria-label={`${link.label} at Sportsbikeshop (opens in a new tab)`}>
            {link.label}
          </a>
        </span>
      ))}{' '}
      at Sportsbikeshop.{' '}
      <a className="rv-affiliate__tag" href="/privacy#affiliate-links">
        Affiliate link
      </a>
    </p>
  );
}
