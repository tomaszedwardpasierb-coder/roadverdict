// Place at: src/app/privacy/PrivacyContent.tsx
//
// The actual policy content, extracted from page.tsx so it has exactly
// one source of truth - both the standalone /privacy page and the
// in-dashboard Privacy tab render this same component, rather than
// two copies of the policy text that could quietly drift apart.
import styles from './privacy.module.css';

const SECTIONS = [
  { id: 'who-we-are', label: 'Who we are' },
  { id: 'free-tools', label: 'Tools you can use without an account' },
  { id: 'account-tracker', label: 'Your account and the bike tracker' },
  { id: 'automated-verdicts', label: 'How we work out if a price is fair' },
  { id: 'reminder-emails', label: 'Reminder emails' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'visitor-analytics', label: 'Visitor analytics' },
  { id: 'affiliate-links', label: 'Affiliate links' },
  { id: 'data-processors', label: 'Who processes your data, and where' },
  { id: 'security', label: 'Keeping your data secure' },
  { id: 'retention', label: 'How long we keep data' },
  { id: 'childrens-privacy', label: "Children's privacy" },
  { id: 'your-rights', label: 'Your rights' },
  { id: 'changes', label: 'Changes to this policy' },
  { id: 'contact', label: 'Contact' },
];

export function PrivacyContent() {
  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>Privacy Policy</h1>
      <span className={styles.updated}>Last updated: 20 July 2026</span>
      <p className={styles.intro}>
        RoadVerdict is a small, independently run UK site. This page explains, in plain
        terms, what we collect, why, and how to see or remove it - not just because the
        law requires it, but because you should be able to actually understand it without
        a solicitor.
      </p>

      <div className={styles.summaryBox}>
        <h2>At a glance</h2>
        <ul>
          <li>The Quote Checker, Cost Calculator, and Buying Guide need no account and collect nothing that identifies you.</li>
          <li>The free bike tracker needs an email address (for magic-link sign-in) and stores whatever you choose to log against your bike - nothing else.</li>
          <li>We never sell data, and we don&apos;t use it for advertising - RoadVerdict doesn&apos;t carry ads at all.</li>
          <li>You can export everything in your tracker as a CSV any time, or ask us to delete your account entirely.</li>
          <li>One cookie, total - it just keeps you signed in.</li>
        </ul>
      </div>

      <nav className={styles.toc}>
        <p>On this page</p>
        <ol>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <section id="who-we-are" className={styles.section}>
        <h2>Who we are</h2>
        <p>
          RoadVerdict is operated independently, as a small personal project rather than
          a large company. For data protection purposes, that means whoever runs the site
          is the &quot;data controller&quot; for anything RoadVerdict collects. The
          quickest way to reach us about anything in this policy, or about your own data,
          is <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>.
        </p>
      </section>

      <section id="free-tools" className={styles.section}>
        <h2>Tools you can use without an account</h2>
        <p>
          The Quote Checker, Cost Calculator, and Buying Guide don&apos;t require signing
          in and don&apos;t ask for your name, email, or registration number. When you use
          them, we store only the bike size, the job type, and the price you were quoted
          - never anything that identifies you, and never your IP address linked to your
          answers. These anonymised answers help keep the underlying price benchmarks
          accurate over time. This runs on a legitimate-interest basis rather than
          consent, because there&apos;s nothing personal collected to consent to in the
          first place.
        </p>
      </section>

      <section id="account-tracker" className={styles.section}>
        <h2>Your account and the bike tracker</h2>
        <p>
          Tracking your bike&apos;s service history, mileage, fuel, and running costs
          requires a free account. We use passwordless (&quot;magic link&quot;) sign-in -
          you enter your email, we send a one-time link, and clicking it signs you in. We
          never ask you to create or remember a password.
        </p>
        <p>Tied to your email address, we store:</p>
        <ul>
          <li>Your email itself, used only to sign you in and send reminders you&apos;ve asked for</li>
          <li>Your bike&apos;s details (make, model, year, mileage, region)</li>
          <li>Whatever you log against it - services, modifications, fuel fill-ups, insurance/tax/MOT payments, and any reminders you&apos;ve set</li>
          <li>A session token in a secure cookie, so you stay signed in between visits</li>
        </ul>
        <p>
          You can export everything you&apos;ve logged as a CSV file directly from your
          dashboard at any time, and you can ask us to delete your account and everything
          tied to it whenever you like - see &quot;Your rights&quot; below.
        </p>
      </section>

      <section id="automated-verdicts" className={styles.section}>
        <h2>How we work out if a price is fair</h2>
        <p>
          When you log a service in the tracker, or use the Quote Checker directly, we
          compare the price against typical UK ranges for that job and engine size, and
          show a Fair, High, or Second Opinion result. This is a straightforward
          rules-based comparison against a fixed price table - not an AI model, and not a
          decision that has any legal or similarly significant effect on you. It&apos;s
          guidance, not a verdict on you personally, and it&apos;s always fine to
          disregard it.
        </p>
      </section>

      <section id="reminder-emails" className={styles.section}>
        <h2>Reminder emails</h2>
        <p>
          If you set a reminder (for a service, insurance renewal, MOT, or similar), we
          email you when it&apos;s due, using our email provider, Resend. We only ever
          email you about reminders you&apos;ve explicitly set - no marketing email, and
          we never share your address with anyone else.
        </p>
      </section>

      <section id="cookies" className={styles.section}>
        <h2>Cookies</h2>
        <p>
          We use one essential cookie to keep you signed in (httpOnly, secure, and not
          readable by JavaScript). It&apos;s strictly necessary for the account and
          tracker to function, so it isn&apos;t something you can decline while staying
          signed in. We don&apos;t use advertising or cross-site tracking cookies of any
          kind.
        </p>
      </section>

      <section id="visitor-analytics" className={styles.section}>
        <h2>Visitor analytics</h2>
        <p>
          Like most websites, our hosting platform automatically collects basic technical
          data about visits - pages requested, response times, and an approximate
          location derived from IP address via a free public geolocation lookup - to help
          us keep the site running reliably and understand overall usage. This is
          aggregate technical data, not linked to your name or email.
        </p>
      </section>

      <section id="affiliate-links" className={styles.section}>
        <h2>Affiliate links</h2>
        <p>
          Some pages, including the tracker when you log tyres or a chain-and-sprockets
          job, include links to retailers we have an affiliate relationship with, such as
          moto-tyres.co.uk and GhostBikes.com. If you buy something after clicking
          through, we may earn a small commission - this never changes the price you pay,
          and we receive no information about what you actually purchase.
        </p>
      </section>

      <section id="data-processors" className={styles.section}>
        <h2>Who processes your data, and where</h2>
        <p>We use a small number of trusted providers to run RoadVerdict, each acting as a data processor under our instructions:</p>
        <ul>
          <li><strong>Microsoft Azure</strong> - UK-hosted (UK West region), stores account and tracker data</li>
          <li><strong>Resend</strong> - sends magic-link and reminder emails, built on infrastructure that may process data outside the UK; where that happens, it&apos;s covered by standard contractual clauses or an equivalent safeguard recognised under UK GDPR</li>
          <li><strong>ip-api.com</strong> - free public geolocation lookup, visitor analytics only</li>
        </ul>
        <p>None of these providers use your data for their own purposes - only to help us provide RoadVerdict to you.</p>
      </section>

      <section id="security" className={styles.section}>
        <h2>Keeping your data secure</h2>
        <p>A few concrete things this site actually does, not just a general promise:</p>
        <ul>
          <li>Every page is served over HTTPS</li>
          <li>Sign-in tokens are never stored in plain text - only a one-way cryptographic hash, so even in the unlikely event of a breach, the tokens themselves couldn&apos;t be reused to sign in as you</li>
          <li>Magic links expire after 15 minutes and work exactly once</li>
          <li>Session cookies are httpOnly - inaccessible to any JavaScript running on the page, which helps protect against cross-site scripting attacks</li>
        </ul>
      </section>

      <section id="retention" className={styles.section}>
        <h2>How long we keep data</h2>
        <p>
          Account and tracker data is kept for as long as your account is active.
          Anonymised quote-checker data has no personal identifiers to delete in the first
          place, so it&apos;s retained indefinitely to keep price benchmarks accurate over
          time.
        </p>
      </section>

      <section id="childrens-privacy" className={styles.section}>
        <h2>Children&apos;s privacy</h2>
        <p>
          RoadVerdict isn&apos;t directed at children, and we don&apos;t knowingly collect
          data from anyone under 13. If you believe a child has provided us with personal
          data, contact us and we&apos;ll delete it.
        </p>
      </section>

      <section id="your-rights" className={styles.section}>
        <h2>Your rights</h2>
        <p>Under UK GDPR, you can ask us at any time to:</p>
        <ul>
          <li><strong>Access</strong> a copy of the data we hold about you</li>
          <li><strong>Correct</strong> anything inaccurate</li>
          <li><strong>Export</strong> your tracker data - or use the CSV export button in your dashboard directly</li>
          <li><strong>Delete</strong> your account and everything associated with it</li>
        </ul>
        <p>
          To exercise any of these, email us - see Contact below. We&apos;ll respond
          within one month, as required by law. You can also complain to the UK
          Information Commissioner&apos;s Office (ico.org.uk) if you&apos;re unhappy with
          how we&apos;ve handled your data.
        </p>
      </section>

      <section id="changes" className={styles.section}>
        <h2>Changes to this policy</h2>
        <p>
          If this policy changes materially, we&apos;ll update the date at the top of
          this page. Continuing to use RoadVerdict after a change means you accept the
          updated version.
        </p>
      </section>

      <section id="contact" className={styles.section}>
        <h2>Contact</h2>
        <p>
          Questions about this policy, or want to exercise any of the rights above? Email
          us directly at <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>.
        </p>
      </section>

      <p className={styles.footerNote}>
        RoadVerdict is guidance benchmarked against typical prices, not a professional
        inspection.
      </p>
    </div>
  );
}
