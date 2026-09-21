// Place at: src/app/about/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About',
  description: 'Who runs RoadVerdict and why it exists.',
  alternates: { canonical: '/about' },
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
        We&apos;re a small team - motorcyclists and drivers, the kind of people who actually
        enjoy standing in a cold garage on a Sunday sorting out their own bike or car, not just
        people who happened to pick &quot;vehicles&quot; as a market. Petrolheads, basically.
        And like most petrolheads, we were sick of the same problem: no way to know if a
        service quote was fair, no real record of what our own bikes and cars had actually cost
        us to run, and nothing to show a buyer except a shoebox of receipts when it came time to
        sell. So we built the thing we wished already existed.
      </p>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', margin: '0 0 0.8rem', color: 'var(--asphalt)' }}>
        How it actually started
      </h2>
      <p style={{ maxWidth: 'none', margin: '0 0 1.5rem' }}>
        RoadVerdict wasn&apos;t a launch. It started as an internal tool for our own small
        group of friends - a spreadsheet-replacement, really, so we&apos;d each stop losing
        track of what we&apos;d spent and when the next service was due. We showed it to a few
        other riders at one of the events we go to, mostly as a &quot;here, this might be
        useful to you too&quot; - and it picked up faster than any of us expected. People we&apos;d
        never met were asking for accounts.
      </p>
      <p style={{ maxWidth: 'none', margin: '0 0 1.5rem' }}>
        That&apos;s when we decided to actually build it properly: added AI so you can scan a
        receipt instead of typing it in by hand, added real UK price data so the Quote Checker
        means something, and opened it up so anyone could sign up and get the same benefit we&apos;d
        been getting ourselves - not just our group of friends.
      </p>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', margin: '0 0 0.8rem', color: 'var(--asphalt)' }}>
        Where it&apos;s at now
      </h2>
      <p style={{ maxWidth: 'none', margin: '0 0 1.5rem' }}>
        RoadVerdict is a proper ownership tracker now, for motorcycles and cars both - log
        services, fuel, modifications, and insurance/tax/MOT payments; get reminders by
        mileage, time, or an exact date; scan a receipt and let AI file it for you; and see real
        reports on what your vehicle actually costs, not a guess. Free tools like the{' '}
        <Link href="/quote-checker">Quote Checker</Link>, <Link href="/cost-calculator">Cost
        Calculator</Link>, and <Link href="/buying-guide">Buying Guide</Link> need no account at
        all. When you come to sell, a shareable link hands the buyer your vehicle&apos;s real
        history instead of a pile of paper receipts. The core tracker stays free for as long as
        you own the vehicle - deeper reports, multiple vehicles, and an AI-written &quot;Story So
        Far&quot; are part of <Link href="/pro">RoadVerdict Pro</Link>.
      </p>
      <p style={{ maxWidth: 'none' }}>
        We&apos;re still small, and we still use this ourselves every time we service our own
        bikes and cars - it&apos;s not a project we handed off to someone else once it grew.
        If something&apos;s wrong, or missing, or you just want to tell us what you think:{' '}
        <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a> reaches us directly,
        not a support queue.
      </p>
    </div>
  );
}
