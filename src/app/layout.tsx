// Place at: src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Big_Shoulders_Display, Inter, IBM_Plex_Mono } from 'next/font/google';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getAdminSession } from '@/lib/admin/session';
import { ImpersonationBanner } from './ImpersonationBanner';
import { AssistantWidget } from '@/components/AssistantWidget';
import { ActiveSectionProvider } from '@/components/ActiveSectionContext';
import { SocialLinks } from '@/components/SocialLinks';
import { SiteHeaderNav } from './SiteHeaderNav';
import './globals.css';
const bigShouldersDisplay = Big_Shoulders_Display({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
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

// No viewport configuration existed anywhere before this - not this
// export, not a manual <meta name="viewport"> tag, nothing. A
// responsive site with zero explicit viewport declaration is relying
// entirely on each browser's own fallback guess, which is exactly the
// kind of gap that can behave inconsistently across browsers and zoom
// levels rather than consistently one way or another.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const impersonatingEmail = cookieStore.get('impersonating_as')?.value ?? null;
  // Only trust/show this if a real admin session is ALSO currently
  // valid - the impersonation cookie alone is never sufficient on its
  // own to display or act on anything.
  const isAdmin = impersonatingEmail ? await getAdminSession() : false;
  const showImpersonationBanner = isAdmin && !!impersonatingEmail;
  return (
    <html lang="en" className={`${bigShouldersDisplay.variable} ${inter.variable} ${plexMono.variable}`}>
      <body>
        <ActiveSectionProvider>
          {showImpersonationBanner && <ImpersonationBanner email={impersonatingEmail!} />}
          <header className="site-header">
            <Link href="/" className="site-header__logo">
              <img src="/logo-dark.png" alt="RoadVerdict" className="site-header__logo-img" />
            </Link>
            <SiteHeaderNav />
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <p>
              RoadVerdict is guidance benchmarked against typical prices, not a professional
              inspection. <Link href="/privacy">Privacy</Link> · <Link href="/about">About us</Link> ·{' '}
              <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>
            </p>
            <SocialLinks />
          </footer>
          <AssistantWidget />
        </ActiveSectionProvider>
      </body>
    </html>
  );
}
