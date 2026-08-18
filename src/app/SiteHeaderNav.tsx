// Place at: src/app/SiteHeaderNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/quote-checker', label: 'Quote Checker' },
  { href: '/cost-calculator', label: 'Cost calculator' },
  { href: '/buying-guide', label: 'Buying a used bike' },
  { href: '/privacy', label: 'Privacy' },
];

export function SiteHeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="site-header__nav">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`site-header__nav-item${pathname === item.href ? ' site-header__nav-item--active' : ''}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
