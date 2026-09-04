// Place at: src/app/SiteHeaderNav.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/privacy', label: 'Privacy' },
];

export function SiteHeaderNav() {
  const pathname = usePathname();
  // layout.tsx persists across navigation (that's the whole point of a
  // layout), so this component never remounts between pages - closing
  // explicitly on link click is required, not just tidy, or the menu
  // would still be open after navigating to the page just chosen.
  const [open, setOpen] = useState(false);

  const links = NAV_ITEMS.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className={`site-header__nav-item${pathname === item.href ? ' site-header__nav-item--active' : ''}`}
      onClick={() => setOpen(false)}
    >
      {item.label}
    </Link>
  ));

  return (
    <>
      {/* Desktop/tablet row - hidden by CSS below the mobile breakpoint,
          not conditionally rendered, so there's no client/server
          hydration mismatch from viewport-dependent JSX. */}
      <nav className="site-header__nav" aria-label="Site">
        {links}
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
