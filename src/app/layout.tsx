// Place at: src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Inter, IBM_Plex_Mono } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getAdminSession } from '@/lib/admin/session';
import { ImpersonationBanner } from './ImpersonationBanner';
import { AssistantWidgetLoader } from '@/components/AssistantWidgetLoader';
import { ActiveSectionProvider } from '@/components/ActiveSectionContext';
import { NavigationLoadingOverlay } from '@/components/NavigationLoadingOverlay';
import { SocialLinks } from '@/components/SocialLinks';
import { SiteHeaderNav } from './SiteHeaderNav';
import './globals.css';
// Google's own catalog folded the old "Big Shoulders Display" static cut
// into the "Big Shoulders" family (an upstream rename hit by the
// next@15.5.25 dependency-vulnerability upgrade, not a choice made
// here) - same fixed weights as before; next/font rejects axes here
// since they only apply when weight is 'variable', not a fixed list.
const bigShouldersDisplay = Big_Shoulders({
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
// Vehicle-neutral on purpose - this is the fallback every page without its
// own metadata falls back to, and cars are a fully shipped, equally-weighted
// product now, not an afterthought. Matches the homepage's own framing
// (page.tsx's title/description) rather than describing only one half of
// what the site actually does.
const SITE_TITLE = 'Know What Your Vehicle Really Costs | RoadVerdict';
const SITE_DESCRIPTION =
  'Log every service, fill-up, and repair. Check if a quote is fair before you pay. Know exactly what you\'re looking at before you buy. Free for motorcycles and cars.';

export const metadata: Metadata = {
  metadataBase: new URL('https://roadverdict.co.uk'),
  title: {
    default: SITE_TITLE,
    template: '%s | RoadVerdict',
  },
  description: SITE_DESCRIPTION,
  // Every page share (WhatsApp, iMessage, Slack, LinkedIn, X) rendered with
  // no image and often no description before this - zero openGraph/twitter
  // metadata existed anywhere in the app. Image intentionally NOT set here -
  // this segment's own opengraph-image.tsx (Next's file-convention OG image)
  // supplies it automatically; a page/segment with its own opengraph-image.tsx
  // (quote-checker, cost-calculator, buying-guide) overrides it for free,
  // without needing to repeat a manual image URL at every level.
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: 'https://roadverdict.co.uk',
    siteName: 'RoadVerdict',
    locale: 'en_GB',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
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
              <Image
                src="/logo-dark.png"
                alt="RoadVerdict"
                width={232}
                height={145}
                priority
                className="site-header__logo-img"
              />
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
          <AssistantWidgetLoader />
          <NavigationLoadingOverlay />
        </ActiveSectionProvider>
      </body>
    </html>
  );
}
