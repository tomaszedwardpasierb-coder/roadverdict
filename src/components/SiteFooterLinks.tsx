// The footer's site directory: every public page, from every page.
//
// Search engines judge a page's importance partly by how many internal
// links point at it. Before this existed, the car pages, /motorcycles,
// /guides, /about and /pro were linked from almost nowhere - the header
// only pointed at the motorcycle tools and the homepage didn't link to
// the vehicle hubs at all - and Google listed them as "Discovered -
// currently not indexed". Built from the price-guide list, so a new guide
// is linked sitewide the moment it's added.
import Link from 'next/link';
import { PRICE_GUIDES, priceGuideHubPath, priceGuidePath, type GuideVehicle } from '@/lib/seo/priceGuides';

const VEHICLE_COLUMNS: { vehicle: GuideVehicle; heading: string; hub: string; tools: { href: string; label: string }[] }[] = [
  {
    vehicle: 'motorcycle',
    heading: 'Motorcycles',
    hub: '/motorcycles',
    tools: [
      { href: '/quote-checker', label: 'Quote checker' },
      { href: '/cost-calculator', label: 'Cost calculator' },
      { href: '/mpg-calculator', label: 'MPG calculator' },
      { href: '/buying-guide', label: 'Buying guide & plate check' },
    ],
  },
  {
    vehicle: 'car',
    heading: 'Cars',
    hub: '/cars',
    tools: [
      { href: '/cars/quote-checker', label: 'Quote checker' },
      { href: '/cars/cost-calculator', label: 'Cost calculator' },
      { href: '/mpg-calculator', label: 'MPG calculator' },
      { href: '/cars/buying-guide', label: 'Buying guide & plate check' },
    ],
  },
];

export function SiteFooterLinks() {
  return (
    <nav className="site-footer__dir" aria-label="Site directory">
      {VEHICLE_COLUMNS.map((col) => (
        <div key={col.vehicle} className="site-footer__col">
          <p className="site-footer__heading">
            <Link href={col.hub}>{col.heading}</Link>
          </p>
          <ul>
            {col.tools.map((t) => (
              <li key={t.href}>
                <Link href={t.href}>{t.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {VEHICLE_COLUMNS.map((col) => (
        <div key={`${col.vehicle}-prices`} className="site-footer__col">
          <p className="site-footer__heading">
            <Link href={priceGuideHubPath(col.vehicle)}>{col.heading.slice(0, -1)} prices</Link>
          </p>
          <ul>
            {PRICE_GUIDES[col.vehicle].map((g) => (
              <li key={g.slug}>
                <Link href={priceGuidePath(g)}>{g.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="site-footer__col">
        <p className="site-footer__heading">
          <Link href="/guides">Guides</Link>
        </p>
        <ul>
          <li>
            <Link href="/guides/buying-a-used-motorcycle">Buying a used motorcycle</Link>
          </li>
          <li>
            <Link href="/guides/buying-a-used-car">Buying a used car</Link>
          </li>
          <li>
            <Link href="/guides/cost-of-owning-a-motorcycle">Cost of owning a motorcycle</Link>
          </li>
          <li>
            <Link href="/guides/cost-of-owning-a-car">Cost of owning a car</Link>
          </li>
        </ul>
      </div>
      <div className="site-footer__col">
        <p className="site-footer__heading">RoadVerdict</p>
        <ul>
          <li>
            <Link href="/about">About us</Link>
          </li>
          <li>
            <Link href="/pro">Pro</Link>
          </li>
          <li>
            <Link href="/videos">Videos</Link>
          </li>
          <li>
            <Link href="/privacy">Privacy</Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
