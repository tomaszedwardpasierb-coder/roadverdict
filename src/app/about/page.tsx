// Place at: src/app/about/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About | RoadVerdict',
  description: 'Who runs RoadVerdict and why it exists.',
};

export default function AboutPage() {
  return (
    <div className="hero">
      <h1>About RoadVerdict</h1>
      <video
        src="/api/video/promo"
        controls
        muted
        loop
        playsInline
        style={{ width: '100%', borderRadius: '12px', marginBottom: '1.5rem' }}
      />
      <p style={{ maxWidth: 'none', margin: '0 0 1.5rem' }}>
        RoadVerdict is run independently, not by a large company - built to fix a genuinely
        annoying problem: not knowing whether a motorcycle service quote is fair, not having a
        real record of what a bike has actually cost to own, and not being able to prove any of
        it when the time comes to sell.
      </p>
      <p style={{ maxWidth: 'none', margin: '0 0 1.5rem' }}>
        It started as a single tool - the <Link href="/quote-checker">Quote Checker</Link>,
        which checks a quote you&apos;ve been given against real UK motorcycle service and
        repair prices - alongside a <Link href="/cost-calculator">Cost Calculator</Link> and a{' '}
        <Link href="/buying-guide">Buying a Used Bike</Link> guide for checking a bike over
        before you hand any money over. All three are free, no sign-in required.
      </p>
      <p style={{ maxWidth: 'none', margin: '0 0 1.5rem' }}>
        Since then it&apos;s grown into a proper ownership tracker: log services, fuel,
        modifications, and insurance/tax/MOT payments; get reminders by mileage, time, or an
        exact date; scan a receipt and let AI file it for you; and see real reports on what your
        bike actually costs, not a guess. When you come to sell, a shareable link hands the buyer
        your bike&apos;s real history instead of a pile of paper receipts. The core of the
        tracker is free, for as long as you own the bike - deeper reports and analytics,
        multiple bikes, and an AI-written &quot;Story So Far&quot; are part of RoadVerdict
        Premium.
      </p>
      <p style={{ maxWidth: 'none' }}>
        RoadVerdict is a small, UK-focused, motorcycle-specific project, not a car app with a
        bike icon bolted on. Questions or feedback:{' '}
        <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>.
      </p>
    </div>
  );
}
