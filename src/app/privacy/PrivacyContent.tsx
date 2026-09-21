// Place at: src/app/privacy/PrivacyContent.tsx
//
// The actual policy content, extracted from page.tsx so it has exactly
// one source of truth - both the standalone /privacy page and the
// in-dashboard Privacy tab render this same component, rather than
// two copies of the policy text that could quietly drift apart.
//
// Rewritten 2026-09-21 to be comprehensive and to reflect what the app
// actually does today (AI receipt scanning, vehicle-history lookups via
// VDG, Stripe payments, the full cookie set, admin/impersonation access) -
// see src/app/privacy-draft/page.tsx for the internal review draft this
// was resolved from. Two things were deliberately left as the site
// owner's own open choice rather than guessed at:
//   - "Who we are" uses generic wording rather than a named legal entity
//     (sole trader vs a registered company) - firm this up before relying
//     on this policy in a dispute; UK GDPR Article 13 expects a
//     controller to be identifiable by more than an email address.
//   - The ICO registration line below states registration has happened,
//     but has no registration number in it - add the real number (from
//     your ICO certificate, or by searching the public register at
//     ico.org.uk/ESDWebPages/Search) once you're ready to display it.
// This is a drafting aid, not legal advice - have it reviewed by a
// solicitor or UK GDPR consultant, particularly the AI and
// international-transfer sections, before treating it as final.
import styles from './privacy.module.css';

const SECTIONS = [
  { id: 'who-we-are', label: 'Who we are' },
  { id: 'scope', label: 'What this policy covers' },
  { id: 'free-tools', label: 'Tools you can use without an account' },
  { id: 'account-tracker', label: 'Your account and the tracker' },
  { id: 'payments', label: 'Payments' },
  { id: 'receipt-scanning', label: 'Receipt scanning (AI-assisted)' },
  { id: 'vehicle-data', label: 'Vehicle and registration data' },
  { id: 'automated-verdicts', label: 'How we work out if a price is fair' },
  { id: 'story-so-far', label: 'The Story So Far' },
  { id: 'shareable-reports', label: 'Shareable reports and buyer requests' },
  { id: 'reminder-emails', label: 'Reminder emails' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'visitor-analytics', label: 'Visitor and account analytics' },
  { id: 'affiliate-links', label: 'Affiliate links' },
  { id: 'internal-access', label: 'Internal access and support' },
  { id: 'data-processors', label: 'Who processes your data, and where' },
  { id: 'international-transfers', label: 'International data transfers' },
  { id: 'security', label: 'Keeping your data secure' },
  { id: 'retention', label: 'How long we keep data' },
  { id: 'childrens-privacy', label: "Children's privacy" },
  { id: 'automated-decisions', label: 'Automated decision-making' },
  { id: 'your-rights', label: 'Your rights' },
  { id: 'breach-notification', label: 'If something goes wrong' },
  { id: 'changes', label: 'Changes to this policy' },
  { id: 'governing-law', label: 'Governing law' },
  { id: 'contact', label: 'Contact' },
];

export function PrivacyContent() {
  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>Privacy Policy</h1>
      <span className={styles.updated}>Last updated: 21 September 2026</span>
      <p className={styles.intro}>
        RoadVerdict is a small, independently run UK site. This page explains, in plain
        terms, what we collect, why, how long we keep it, who we share it with, and how
        to see or remove it - not just because the law requires it, but because you
        should be able to actually understand it without a solicitor.
      </p>

      <div className={styles.summaryBox}>
        <h2>At a glance</h2>
        <ul>
          <li>The Quote Checker, Cost Calculator, and Buying Guide need no account and collect nothing that identifies you.</li>
          <li>The free tracker needs an email address (for magic-link sign-in) and stores whatever you choose to log against your bike or car.</li>
          <li>Receipts you scan are read by an AI provider to fill in the details automatically - you always review before anything saves.</li>
          <li>We look up your registration plate against DVLA/DVSA-sourced records to show MOT history and vehicle specs.</li>
          <li>Payments (Pro subscriptions, one-time reports) are handled entirely by Stripe - we never see or store your card details.</li>
          <li>We never sell data, and we don&apos;t use it for advertising - RoadVerdict doesn&apos;t carry ad networks at all.</li>
          <li>You can export everything in your tracker as a CSV any time, or ask us to delete your account entirely.</li>
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
          is the &quot;data controller&quot; for anything RoadVerdict collects.
        </p>
        <p>
          RoadVerdict is registered with the UK Information Commissioner&apos;s Office
          (ICO) under the Data Protection (Charges and Information) Regulations 2018.
        </p>
        <p>
          The quickest way to reach us about anything in this policy, or about your own
          data, is <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>.
        </p>
      </section>

      <section id="scope" className={styles.section}>
        <h2>What this policy covers</h2>
        <p>
          This policy covers the RoadVerdict website, the free tools (Quote Checker, Cost
          Calculator, Buying Guide), the bike and car tracker and account area, and the
          buyer-facing report pages generated by Shareable Links - including for people
          who view or interact with a report without ever creating a RoadVerdict account
          themselves. It doesn&apos;t cover third-party sites we link to, including
          affiliate retailers and any DVLA/DVSA/GOV.UK pages referenced elsewhere on the
          site - those have their own privacy policies.
        </p>
      </section>

      <section id="free-tools" className={styles.section}>
        <h2>Tools you can use without an account</h2>
        <p>
          The Quote Checker, Cost Calculator, and Buying Guide don&apos;t require signing
          in and don&apos;t ask for your name, email, or registration number. When you use
          them, we store only the vehicle size/type, the job type, and the price you were
          quoted - never anything that identifies you, and never your IP address linked
          to your answers. These anonymised answers help keep the underlying price
          benchmarks accurate over time. This runs on a legitimate-interest legal basis
          rather than consent, because there&apos;s nothing personal collected to consent
          to in the first place.
        </p>
      </section>

      <section id="account-tracker" className={styles.section}>
        <h2>Your account and the tracker</h2>
        <p>
          Tracking your bike or car&apos;s service history, mileage, fuel, and running
          costs requires a free account. We use passwordless (&quot;magic link&quot;)
          sign-in - you enter your email, we send a one-time link, and clicking it signs
          you in. We never ask you to create or remember a password. This processing is
          carried out on the basis that it&apos;s necessary to perform our contract with
          you to provide the tracker (UK GDPR Article 6(1)(b)).
        </p>
        <p>Tied to your email address, we store:</p>
        <ul>
          <li>Your email itself, used only to sign you in and send reminders you&apos;ve asked for</li>
          <li>Your vehicle&apos;s details (make, model, year, mileage, region)</li>
          <li>Whatever you log against it - services, modifications, fuel fill-ups, insurance/tax/MOT payments, and any reminders you&apos;ve set</li>
          <li>Any receipts or documents you attach, including anything you store in the Vault (see &quot;Receipt scanning&quot; and &quot;Keeping your data secure&quot; below)</li>
          <li>A session token in a secure cookie, so you stay signed in between visits</li>
        </ul>
        <p>
          You can export everything you&apos;ve logged as a CSV file directly from your
          dashboard at any time, and you can ask us to delete your account and everything
          tied to it whenever you like - see &quot;Your rights&quot; below.
        </p>
      </section>

      <section id="payments" className={styles.section}>
        <h2>Payments</h2>
        <p>
          If you subscribe to Pro, or buy a one-time Independent Vehicle Check or Buying
          Guide report, your payment is handled entirely by Stripe, our payment
          processor - your card details are entered directly into Stripe&apos;s own
          checkout and never reach our servers. We keep only what we need to know what
          you&apos;re entitled to: Stripe&apos;s own customer, subscription, and session
          identifiers, and a record of what was purchased, when, and for how much. This
          is carried out on the basis that it&apos;s necessary to perform our contract
          with you (Article 6(1)(b)).
        </p>
        <p>
          If you have a Pro subscription, you can view invoices, change plan, update your
          payment method, or cancel at any time through Stripe&apos;s own billing portal,
          linked from the Pro page in your account.
        </p>
      </section>

      <section id="receipt-scanning" className={styles.section}>
        <h2>Receipt scanning (AI-assisted)</h2>
        <p>
          When you scan a receipt, the photo is sent to Google&apos;s Gemini AI to
          automatically read the date, cost, item description, and mileage, so you
          don&apos;t have to type it in by hand. You review and can edit everything it
          extracts before anything is saved - the AI drafts the entry, it doesn&apos;t
          create it unattended. This is carried out on the basis that it&apos;s necessary
          to provide the tracker feature you&apos;ve asked to use (Article 6(1)(b)), the
          same basis as the rest of the account.
        </p>
        <p>
          We use Google&apos;s paid Gemini API tier for this, not the free consumer tier -
          under Google&apos;s terms, content submitted through the paid tier isn&apos;t
          used to train or improve its models.
        </p>
        <p>
          The receipt photo itself is kept as an attachment on the record it creates, so
          you can view the original again later - it isn&apos;t discarded once the AI has
          read it. It&apos;s deleted when you delete that record, remove the bike or car
          it belongs to, or delete your account.
        </p>
      </section>

      <section id="vehicle-data" className={styles.section}>
        <h2>Vehicle and registration data</h2>
        <p>
          When you add a bike or car, or ask us to refresh its data, we look up its
          registration plate through Vehicle Data Global (VDG), a commercial vehicle-data
          provider, to show technical specifications and MOT history, and - for the paid
          Independent Vehicle Check and Buying Guide reports - stolen-marker, write-off,
          and outstanding-finance status and keeper/plate-change history. VDG&apos;s own
          data draws on DVLA and DVSA (MOT history) records, the Police National
          Computer, insurance write-off databases (MIAFTR), and finance houses, each of
          which is an independent data controller for its own underlying records. This is
          carried out on the basis that it&apos;s necessary to provide the feature
          you&apos;ve asked for (Article 6(1)(b)).
        </p>
      </section>

      <section id="automated-verdicts" className={styles.section}>
        <h2>How we work out if a price is fair</h2>
        <p>
          When you log a service in the tracker, or use the Quote Checker directly, we
          compare the price against typical UK ranges for that job and vehicle, and show
          a Fair, High, or Second Opinion result. This is a straightforward rules-based
          comparison against a fixed price table - not an AI model, and not a decision
          that has any legal or similarly significant effect on you. It&apos;s guidance,
          not a verdict on you personally, and it&apos;s always fine to disregard it.
        </p>
      </section>

      <section id="story-so-far" className={styles.section}>
        <h2>The Story So Far</h2>
        <p>
          If you generate a &quot;Story So Far&quot; for your bike or car, we first
          calculate a set of plain facts from your logged history ourselves - things like
          how long you&apos;ve owned it, your total spend by category, and your service
          rhythm. Only those pre-computed facts, never your raw records, receipts, or
          account details, are then sent to the same paid-tier Gemini API used for
          receipt scanning, to be turned into readable prose. This is a deliberate design
          choice to limit what leaves our systems for this feature, not an incidental
          detail. The Buying Guide&apos;s AI-written vehicle briefing and buyer-opinion
          summaries work the same way.
        </p>
      </section>

      <section id="shareable-reports" className={styles.section}>
        <h2>Shareable reports and buyer requests</h2>
        <p>
          If you generate a shareable report link, anyone with that link can view the
          vehicle information and history you&apos;ve chosen to include, without needing
          a RoadVerdict account of their own. A prospective buyer viewing a report can
          request to see specific receipts; if they do, we ask for their email address so
          you can respond to the request and so we can notify them of your decision. We
          don&apos;t use a buyer&apos;s email for anything beyond that specific request.
        </p>
        <p>
          Share links are created for a fixed duration you choose - 1 week, 1 month, or 6
          months - and are permanently deleted automatically once that period passes. You
          can also revoke a link immediately yourself at any time from the Shareable
          Links tab in your dashboard. Deleting or letting a link expire also deletes any
          receipt requests made against it.
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
        <p>Cookies set for regular visitors and account holders:</p>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Cookie</th>
              <th>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Session</td>
              <td>Keeps you signed in</td>
              <td>30 days</td>
            </tr>
            <tr>
              <td>Two-factor pending</td>
              <td>Bridges the moment between entering your 2FA code and being signed in</td>
              <td>5 minutes</td>
            </tr>
            <tr>
              <td>Vault re-authentication</td>
              <td>Confirms you&apos;ve recently re-verified before viewing Vault documents</td>
              <td>10 minutes</td>
            </tr>
            <tr>
              <td>Active vehicle</td>
              <td>Remembers which of your vehicles you&apos;re currently viewing</td>
              <td>1 year</td>
            </tr>
            <tr>
              <td>Shared-report access</td>
              <td>Remembers you&apos;ve already passed the registration-plate check for one specific shared report</td>
              <td>7 days</td>
            </tr>
            <tr>
              <td>Anonymous assistant identity</td>
              <td>Lets you keep a conversation with the AI assistant before you sign in</td>
              <td>~400 days</td>
            </tr>
          </tbody>
        </table>
        <p>
          Separately, a small number of cookies exist only for RoadVerdict&apos;s own
          administration - they&apos;re never set for your account unless you are the
          person running the site:
        </p>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Cookie</th>
              <th>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Admin sign-in</td>
              <td>The site operator&apos;s own admin login</td>
              <td>5 minutes (pending) / 12 hours (signed in)</td>
            </tr>
            <tr>
              <td>Impersonation session</td>
              <td>Lets the site operator temporarily view an account as you would, for support - see &quot;Internal access and support&quot; below</td>
              <td>Matches a normal sign-in session, cleared when the admin ends it</td>
            </tr>
          </tbody>
        </table>
        <p>
          All of these are strictly necessary for the site to function - none of them are
          advertising or cross-site tracking cookies, and none can be declined while
          staying signed in.
        </p>
      </section>

      <section id="visitor-analytics" className={styles.section}>
        <h2>Visitor and account analytics</h2>
        <p>
          Like most websites, our hosting platform automatically collects basic technical
          data about visits - pages requested, response times, and an approximate
          location derived from IP address via a free public geolocation lookup
          (ip-api.com) - to help us keep the site running reliably and understand overall
          usage. This is aggregate technical data, not linked to your name or email.
        </p>
        <p>
          Separately, we record browser/device information and sign-in timestamps
          against specific accounts, mainly to help you and us spot suspicious access -
          for example, the Vault&apos;s own access log shows you your last few sign-ins.
          Unlike the paragraph above, this is linked to your account.
        </p>
        <p>
          We also use Microsoft Application Insights (part of Azure) for error and
          performance monitoring. This is primarily response-time and error/stack-trace
          data, not personal data by design - but we haven&apos;t yet added a dedicated
          step to actively scrub personal data from error logs, so it&apos;s possible a
          bug could occasionally cause something identifying to appear in a log line. We
          treat that as a gap worth closing, not a caveat to hide behind.
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

      <section id="internal-access" className={styles.section}>
        <h2>Internal access and support</h2>
        <p>
          A small number of people involved in running RoadVerdict can, where necessary,
          access account data to investigate a support request or fix a technical
          problem - including, in limited circumstances, viewing the site as you would
          see it (an &quot;impersonation&quot; session) to diagnose an issue you&apos;ve
          reported. This access is limited to what&apos;s needed to resolve the specific
          issue, and every impersonation session is logged - who was accessed, when, and
          the reason given - so it can be reviewed after the fact.
        </p>
      </section>

      <section id="data-processors" className={styles.section}>
        <h2>Who processes your data, and where</h2>
        <p>We use a small number of trusted providers to run RoadVerdict, each acting as a data processor under our instructions:</p>
        <ul>
          <li><strong>Microsoft Azure</strong> - UK-hosted (UK West region). Stores account and tracker data, receipt and Vault document attachments, and application logs, and hosts the site itself.</li>
          <li><strong>Google (Gemini API, paid tier)</strong> - reads receipt photos and drafts AI-generated summaries (Story So Far, Buying Guide briefings). Paid-tier terms mean this content isn&apos;t used to train Google&apos;s models.</li>
          <li><strong>Vehicle Data Global (VDG)</strong> - vehicle registration, MOT history, and (for paid checks) write-off/finance/stolen and keeper-change lookups.</li>
          <li><strong>Stripe</strong> - payment processing for Pro subscriptions and one-time report purchases. Card details are handled entirely by Stripe and never reach our own servers.</li>
          <li><strong>Resend</strong> - sends magic-link and reminder emails, built on infrastructure that may process data outside the UK; where that happens, it&apos;s covered by standard contractual clauses or an equivalent safeguard recognised under UK GDPR.</li>
          <li><strong>ip-api.com</strong> - free public geolocation lookup, aggregate visitor analytics only.</li>
        </ul>
        <p>
          Fonts on this site are bundled and served from our own domain at build time
          (via Next.js&apos;s font optimisation), not loaded from Google&apos;s servers at
          request time - so simply viewing pages doesn&apos;t send your IP address to
          Google for this.
        </p>
        <p>None of these providers use your data for their own purposes - only to help us provide RoadVerdict to you.</p>
      </section>

      <section id="international-transfers" className={styles.section}>
        <h2>International data transfers</h2>
        <p>
          Most of our processing happens in the UK (Azure&apos;s UK West region). Some
          processors - Google (Gemini API) and Resend - may process data outside the UK
          as part of their own infrastructure. Where that happens, we rely on standard
          contractual clauses or another transfer mechanism recognised under UK GDPR to
          keep your data protected to a UK standard regardless of where it&apos;s
          processed. Stripe, as a global payment processor, maintains its own
          UK/EU-recognised safeguards for the payment data it handles on our behalf.
        </p>
      </section>

      <section id="security" className={styles.section}>
        <h2>Keeping your data secure</h2>
        <p>A few concrete things this site actually does, not just a general promise:</p>
        <ul>
          <li>Every page is served over HTTPS</li>
          <li>Sign-in tokens are never stored in plain text - only a one-way cryptographic hash, so even in the unlikely event of a breach, the tokens themselves couldn&apos;t be reused to sign in as you</li>
          <li>Magic links expire after 15 minutes and work exactly once</li>
          <li>Session cookies are httpOnly - inaccessible to any JavaScript running on the page, which helps protect against cross-site scripting attacks</li>
          <li>Data at rest in Azure Cosmos DB is encrypted by default</li>
          <li>Documents you store in the Vault are encrypted, and viewing them requires a fresh re-authentication, not just an already-open sign-in session</li>
          <li>You can turn on two-factor authentication for your own account</li>
        </ul>
        <p>
          We rely on Azure&apos;s standard backup and disaster-recovery mechanisms;
          backups are protected the same way as our live data and are retained only long
          enough to support recovery from a technical failure, not kept as a separate
          long-term archive.
        </p>
      </section>

      <section id="retention" className={styles.section}>
        <h2>How long we keep data</h2>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Retention</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Account and tracker data (while active)</td>
              <td>For as long as your account remains active</td>
            </tr>
            <tr>
              <td>Account and tracker data (after you ask us to delete it)</td>
              <td>Deleted within 30 days of your request</td>
            </tr>
            <tr>
              <td>Receipt images sent for AI scanning</td>
              <td>Kept as an attachment on the record until that record, vehicle, or your account is deleted - see &quot;Receipt scanning&quot;</td>
            </tr>
            <tr>
              <td>Share link tokens and buyer receipt requests</td>
              <td>Deleted automatically once the link&apos;s chosen duration expires, or immediately if you revoke it</td>
            </tr>
            <tr>
              <td>Anonymised Quote Checker data</td>
              <td>Indefinitely - no personal identifiers exist to delete</td>
            </tr>
            <tr>
              <td>Server/application logs</td>
              <td>Age out under our monitoring platform&apos;s standard retention settings - we don&apos;t keep a separate, longer-lived copy</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="childrens-privacy" className={styles.section}>
        <h2>Children&apos;s privacy</h2>
        <p>
          RoadVerdict isn&apos;t directed at children, and we don&apos;t knowingly collect
          data from anyone under 13. If you believe a child has provided us with personal
          data, contact us and we&apos;ll delete it.
        </p>
      </section>

      <section id="automated-decisions" className={styles.section}>
        <h2>Automated decision-making</h2>
        <p>
          RoadVerdict uses some automated processing - the Fair/High/Second Opinion price
          comparison, and AI assistance for reading receipts and drafting narrative
          summaries (the Story So Far, and the Buying Guide&apos;s AI briefing). None of
          this results in a decision that produces legal effects or similarly
          significantly affects you: every AI-drafted entry can be reviewed and edited
          before it&apos;s saved, and the price comparison is guidance you&apos;re always
          free to disregard. You won&apos;t be automatically refused service, charged
          differently, or have anything decided about you without a person being able to
          review it.
        </p>
      </section>

      <section id="your-rights" className={styles.section}>
        <h2>Your rights</h2>
        <p>Under UK GDPR, you can ask us at any time to:</p>
        <ul>
          <li><strong>Access</strong> a copy of the data we hold about you</li>
          <li><strong>Correct (rectify)</strong> anything inaccurate or incomplete</li>
          <li><strong>Erase</strong> your account and everything associated with it</li>
          <li><strong>Restrict</strong> how we process your data in certain circumstances</li>
          <li><strong>Port</strong> your tracker data to another service in a structured, machine-readable format - or use the CSV export button in your dashboard directly</li>
          <li><strong>Object</strong> to processing carried out on a legitimate-interest basis</li>
          <li><strong>Withdraw consent</strong> at any time, for anything we process on that basis</li>
        </ul>
        <p>
          To exercise any of these, email us - see Contact below. We&apos;ll respond
          within one month, as required by law. You can also complain to the UK
          Information Commissioner&apos;s Office if you&apos;re unhappy with how
          we&apos;ve handled your data:{' '}
          <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener">ico.org.uk/make-a-complaint</a>,
          or by phone on 0303 123 1113.
        </p>
      </section>

      <section id="breach-notification" className={styles.section}>
        <h2>If something goes wrong</h2>
        <p>
          If a personal data breach occurs that&apos;s likely to result in a risk to your
          rights and freedoms, we&apos;ll notify the ICO within 72 hours of becoming aware
          of it, as required by UK GDPR. Where a breach is likely to result in a{' '}
          <em>high</em> risk to you specifically, we&apos;ll also notify you directly,
          without undue delay.
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

      <section id="governing-law" className={styles.section}>
        <h2>Governing law</h2>
        <p>This policy, and your use of RoadVerdict, is governed by the laws of England and Wales.</p>
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
