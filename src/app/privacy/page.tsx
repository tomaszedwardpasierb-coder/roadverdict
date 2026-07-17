// Place at: src/app/privacy/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | RoadVerdict',
  description: 'How RoadVerdict collects, uses, and protects data across our free motorcycle tools, tracker, and account features.',
};

export default function PrivacyPage() {
  return (
    <div className="hero">
      <h1>Privacy Policy</h1>
      <p>
        Last updated: 17 July 2026. RoadVerdict is a UK-based, independently run site.
        This page explains what we collect, why, and how to exercise your rights over it.
      </p>

      <h2>The tools you can use without an account</h2>
      <p>
        The Quote Checker, Cost Calculator, and Buying Guide don&apos;t require signing in
        and don&apos;t ask for your name, email, or registration number. When you use them,
        we store only the bike size, the job type, and the price you were quoted — never
        anything that identifies you, and we don&apos;t log your IP address against your
        answers. These anonymised answers help build and improve the price benchmarks the
        checker relies on. This is a legitimate-interest basis, not consent — there is
        nothing to opt into, because nothing personal is collected in the first place.
      </p>

      <h2>Your account and the bike tracker</h2>
      <p>
        Tracking your bike&apos;s service history, mileage, fuel, and running costs requires
        a free account. We use passwordless (&quot;magic link&quot;) sign-in — you enter your
        email, we send you a one-time link, and clicking it signs you in. We never ask you
        to create or remember a password.
      </p>
      <p>We store, tied to your email address:</p>
      <ul>
        <li>Your email address itself, used only to sign you in and send reminders you&apos;ve asked for</li>
        <li>Your bike&apos;s details (make, model, year, mileage) and anything you log against it — services, modifications, fuel fill-ups, insurance/tax/MOT payments, and reminders you&apos;ve set</li>
        <li>A session token stored in a secure cookie, so you stay signed in between visits</li>
      </ul>
      <p>
        This data exists to provide the tracker itself — you can export everything you&apos;ve
        logged as a CSV file at any time directly from your dashboard, and you can request
        deletion of your account and all associated data at any time (see &quot;Your
        rights&quot; below).
      </p>

      <h2>Reminder emails</h2>
      <p>
        If you set a reminder (for a service, insurance renewal, MOT, or similar), we send
        you an email when it&apos;s due, using our email provider, Resend. We only ever email
        you about reminders you&apos;ve explicitly set — we don&apos;t send marketing email, and
        we don&apos;t share your email address with anyone else.
      </p>

      <h2>Cookies</h2>
      <p>
        We use one essential cookie to keep you signed in (httpOnly, secure, and not
        readable by JavaScript). It&apos;s strictly necessary for the account and tracker to
        function, so it&apos;s not something you can decline while staying signed in. We don&apos;t
        use advertising or cross-site tracking cookies.
      </p>

      <h2>Visitor analytics</h2>
      <p>
        Like most websites, our hosting platform automatically collects basic technical
        data about visits — pages requested, response times, and approximate location
        derived from IP address via a free public geolocation lookup — to help us keep the
        site running reliably and understand overall usage. This is aggregate technical
        data, not linked to your name or email.
      </p>

      <h2>Affiliate links</h2>
      <p>
        Some pages (including the tracker, when you log tyres or a chain-and-sprockets job)
        include links to retailers we have an affiliate relationship with, such as
        moto-tyres.co.uk and GhostBikes.com. If you click through and buy something, we may
        earn a small commission — this never affects the price you pay, and we don&apos;t
        receive any information about what you purchase.
      </p>

      <h2>Who processes this data</h2>
      <p>
        We use a small number of trusted providers to run RoadVerdict, each acting as a
        data processor under our instructions:
      </p>
      <ul>
        <li><strong>Microsoft Azure</strong> (UK-based hosting and database) — stores account and tracker data</li>
        <li><strong>Resend</strong> — sends magic-link and reminder emails</li>
        <li><strong>ip-api.com</strong> — free public geolocation lookup for visitor analytics only</li>
      </ul>
      <p>
        None of these providers use your data for their own purposes — they process it only
        to help us provide RoadVerdict to you.
      </p>

      <h2>How long we keep data</h2>
      <p>
        Account and tracker data is kept for as long as your account is active. Anonymised
        quote-checker data has no personal identifiers to delete in the first place, so it&apos;s
        retained indefinitely to keep price benchmarks accurate over time.
      </p>

      <h2>Your rights</h2>
      <p>Under UK GDPR, you can ask us at any time to:</p>
      <ul>
        <li><strong>Access</strong> a copy of the data we hold about you</li>
        <li><strong>Correct</strong> anything inaccurate</li>
        <li><strong>Export</strong> your tracker data (or use the CSV export button in your dashboard directly)</li>
        <li><strong>Delete</strong> your account and everything associated with it</li>
      </ul>
      <p>
        To exercise any of these rights, email us — see Contact below. We&apos;ll respond
        within one month, as required by law. You also have the right to complain to the
        UK Information Commissioner&apos;s Office (ico.org.uk) if you&apos;re unhappy with how
        we&apos;ve handled your data.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If this policy changes materially, we&apos;ll update the date at the top of this page.
        Continuing to use RoadVerdict after a change means you accept the updated version.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy, or want to exercise any of the rights above? Contact us
        at the email address shown in the site footer.
      </p>

      <p style={{ marginTop: '2rem', fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
        RoadVerdict is guidance benchmarked against typical prices, not a professional
        inspection. <Link href="/privacy">Privacy</Link>
      </p>
    </div>
  );
}
