// Place at: src/app/SiteHeaderNav.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

// Vehicle-first: Motorcycles and Cars each lead to a hub with that
// vehicle's own tools and price guides. The nav used to link only to the
// motorcycle tools - on every page - so car owners landed on the wrong
// tool, and the car pages had almost no internal links for search engines
// to follow (they sat in Google's "Discovered - not indexed" list).
//
// "Quote checker" follows the page you're on: from anywhere under /cars
// it opens the car one, otherwise the motorcycle one, which links across.
// The MPG calculator is one page for both.
function navItems(pathname: string) {
  const onCarPage = pathname === '/cars' || pathname.startsWith('/cars/');
  return [
    { href: '/motorcycles', label: 'Motorcycles' },
    { href: '/cars', label: 'Cars' },
    { href: onCarPage ? '/cars/quote-checker' : '/quote-checker', label: 'Quote Checker' },
    { href: '/mpg-calculator', label: 'MPG Calculator' },
    { href: '/guides', label: 'Guides & Prices' },
    { href: '/pro', label: 'Pro' },
  ];
}

// The two things most visitors come for - the free MOT check (one page for
// both kinds) and the paid full history check - lead the row on desktop and
// stay on screen on a phone instead of hiding behind the menu button. The
// history check opens the bike version on motorcycle pages and the car
// version everywhere else, since most history-check buyers are buying cars.
function keyItems(pathname: string) {
  const onBikePage =
    pathname === '/motorcycles' ||
    pathname.startsWith('/motorcycles/') ||
    pathname === '/buying-guide' ||
    pathname === '/quote-checker' ||
    pathname.startsWith('/guides/motorcycle');
  return [
    { href: '/mot-check', label: 'MOT Check' },
    { href: onBikePage ? '/buying-guide' : '/cars/buying-guide', label: 'History Check' },
  ];
}

export function SiteHeaderNav() {
  const pathname = usePathname();
  const NAV_ITEMS = navItems(pathname ?? '/');
  const KEY_ITEMS = keyItems(pathname ?? '/');
  // layout.tsx persists across navigation (that's the whole point of a
  // layout), so this component never remounts between pages - closing
  // explicitly on link click is required, not just tidy, or the menu
  // would still be open after navigating to the page just chosen.
  const [open, setOpen] = useState(false);

  const toLink = (item: { href: string; label: string }, key: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      className={`site-header__nav-item${key ? ' site-header__nav-item--key' : ''}${pathname === item.href ? ' site-header__nav-item--active' : ''}`}
      onClick={() => setOpen(false)}
    >
      {item.label}
    </Link>
  );
  const links = NAV_ITEMS.map((item) => toLink(item, false));
  const keyLinks = KEY_ITEMS.map((item) => toLink(item, true));

  return (
    <>
      {/* Desktop/tablet row - hidden by CSS below the mobile breakpoint,
          not conditionally rendered, so there's no client/server
          hydration mismatch from viewport-dependent JSX. */}
      <nav className="site-header__nav" aria-label="Site">
        {keyLinks}
        {links}
      </nav>

      {/* The phone's own row for the two key links, always visible under
          the logo - hidden by CSS on wider screens, where they lead the
          row above instead. */}
      <nav className="site-header__keyRow" aria-label="Checks">
        {keyLinks}
      </nav>

      {/* Mirror image of the row above: invisible until the mobile
          breakpoint, at which point it replaces the row as the only
          way to reach these links - a single icon that's effectively
          impossible to "not fit," unlike four spelled-out labels
          wrapping under font-size scaling or a narrow viewport. */}
      <button
        type="button"
        className="site-header__menuBtn"
        aria-expanded={open}
        aria-controls="site-header-mobile-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
      </button>

      {open && (
        <nav id="site-header-mobile-menu" className="site-header__mobileMenu" aria-label="Site">
          {links}
        </nav>
      )}
    </>
  );
}
