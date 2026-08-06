// Place at: src/app/layout.tsx
import type { Metadata } from 'next';
import { Oswald, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-body',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
export const metadata: Metadata = {
  metadataBase: new URL('https://roadverdict.co.uk'),
  title: {
    default: 'RoadVerdict - is your motorcycle quote fair?',
    template: '%s | RoadVerdict',
  },
  description:
    'Enter your bike, the job, and what you were quoted. Get an instant verdict benchmarked against typical UK motorcycle service and repair prices.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <header className="site-header">
          <Link href="/" className="site-header__logo">
            <img src="/logo.png" alt="RoadVerdict" className="site-header__logo-img" />
          </Link>
          <nav className="site-header__nav">
            <Link href="/track">Track your bike</Link>
            <Link href="/cost-calculator">Cost calculator</Link>
            <Link href="/buying-guide">Buying a used bike</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <p>
            RoadVerdict is guidance benchmarked against typical prices, not a professional
            inspection. <Link href="/privacy">Privacy</Link> · <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
