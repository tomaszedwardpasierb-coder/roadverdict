// Place at: src/app/privacy-draft/page.tsx
//
// Admin-only. Not the live public policy - a working draft of a much
// more comprehensive rewrite, with review flags on anything that isn't
// verified true of the app yet. See the banner below for what those
// mean. This route is gated the same way /tomasz is (getAdminSession),
// excluded from robots.ts, and marked noindex here too as a second
// layer - it should never be reachable by anyone who isn't signed in
// as admin, and never crawlable even if a link to it leaks somewhere.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin/session';
import styles from './privacy-draft.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy Draft (admin only) | RoadVerdict',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// Marks a claim that either isn't true of the current implementation
// yet, or depends on a fact only the site owner can supply (company
// details, retention periods, which API tier is actually in use).
// Every one of these needs to be resolved - either by changing the
// implementation to match, or by rewriting the sentence to match
// reality - before this page goes live. See the banner at the top.
function Flag({ children }: { children: ReactNode }) {
  return <span className={styles.flag}>⚠ {children}</span>;
}

const SECTIONS = [
  { id: 'who-we-are', label: 'Who we are' },
  { id: 'scope', label: 'What this policy covers' },
  { id: 'free-tools', label: 'Tools you can use without an account' },
  { id: 'account-tracker', label: 'Your account and the bike tracker' },
  { id: 'receipt-scanning', label: 'Receipt scanning (AI-assisted)' },
  { id: 'vehicle-data', label: 'Vehicle and registration data' },
  { id: 'automated-verdicts', label: 'How we work out if a price is fair' },
  { id: 'story-so-far', label: 'The Story So Far' },
  { id: 'shareable-reports', label: 'Shareable reports and buyer requests' },
  { id: 'ownership-transfer', label: 'Ownership transfer ("Passport") - planned' },
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

export default async function PrivacyDraftPage() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) redirect('/tomasz/login');

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>Privacy Policy</h1>
      <span className={styles.updated}>Last updated: [DATE - update when this replaces the live page]</span>

      <div className={styles.reviewBanner}>
        <h2>Internal review draft - not for publishing as-is</h2>
        <p>
          Text marked like <Flag>this</Flag> flags a claim this policy needs to make that either isn&apos;t true of
          the app today, or depends on a fact only you can supply. Resolve every flagged item - by changing the
          implementation to match, or by rewriting the sentence to match reality - before this replaces the public
          page. A policy that visibly admits &quot;we don&apos;t actually do this&quot; is worse than the shorter,
          fully-accurate one currently live. This document is a drafting aid, not legal advice - have it reviewed by
          a solicitor or UK GDPR consultant before publishing, particularly the AI and international-transfer
          sections.
        </p>
      </div>

      <p className={styles.intro}>
        RoadVerdict is a small, independently run UK site. This page explains, in plain terms, what we collect, why,
        how long we keep it, who we share it with, and how to see or remove it - not just because the law requires
        it, but because you should be able to actually understand it without a solicitor.
      </p>

      <div className={styles.summaryBox}>
        <h2>At a glance</h2>
        <ul>
          <li>The Quote Checker, Cost Calculator, and Buying Guide need no account and collect nothing that identifies you.</li>
          <li>The free bike tracker needs an email address (for magic-link sign-in) and stores whatever you choose to log against your bike.</li>
          <li>Receipts you scan are processed by an AI provider to read the details automatically - see &quot;Receipt scanning&quot; below.</li>
          <li>We look up your registration plate against DVLA/DVSA records to show MOT history and vehicle specs - see &quot;Vehicle and registration data&quot; below.</li>
          <li>We never sell data, and we don&apos;t use it for advertising - RoadVerdict doesn&apos;t carry ads at all.</li>
          <li>You can export everything in your tracker as a CSV any time, or ask us to delete your account entirely.</li>
          <li><Flag>Cookie count needs re-checking - likely more than one now (see &quot;Cookies&quot;).</Flag></li>
          <li>
            <Flag>
              A planned &quot;Passport&quot; ownership-transfer feature isn&apos;t built yet - see &quot;Ownership
              transfer&quot; below for the privacy commitments it needs to meet before it ships, not a description
              of anything live today.
            </Flag>
          </li>
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
          RoadVerdict is operated independently, as a small personal project rather than a large company. For data
          protection purposes, that makes whoever runs the site the &quot;data controller&quot; for anything
          RoadVerdict collects.
        </p>
        <p>
          <Flag>
            Trading/legal name, business address, and (if operating as a registered company rather than a sole
            trader) company number need to go here - a controller has to be identifiable by more than an email
            address for this to meet UK GDPR Article 13 disclosure requirements.
          </Flag>
        </p>
        <p>
          <Flag>
            Confirm whether RoadVerdict needs to register with the ICO and pay the data protection fee (most
            organisations processing personal data on computers do, with narrow exemptions) - if registered, the ICO
            registration number should be stated here.
          </Flag>
        </p>
        <p>
          The quickest way to reach us about anything in this policy, or about your own data, is{' '}
          <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>.
        </p>
      </section>

      <section id="scope" className={styles.section}>
        <h2>What this policy covers</h2>
        <p>
          This policy covers the RoadVerdict website, the free tools (Quote Checker, Cost Calculator, Buying Guide),
          the bike tracker and account area, and the buyer-facing report pages generated by Shareable Links -
          including for people who view or interact with a report without ever creating a RoadVerdict account
          themselves. It doesn&apos;t cover third-party sites we link to, including affiliate retailers and the DVLA
          / TfL / GOV.UK pages referenced elsewhere on the site - those have their own privacy policies.
        </p>
      </section>

      <section id="free-tools" className={styles.section}>
        <h2>Tools you can use without an account</h2>
        <p>
          The Quote Checker, Cost Calculator, and Buying Guide don&apos;t require signing in and don&apos;t ask for
          your name, email, or registration number. When you use them, we store only the bike size, the job type,
          and the price you were quoted - never anything that identifies you, and never your IP address linked to
          your answers. These anonymised answers help keep the underlying price benchmarks accurate over time. This
          runs on a legitimate-interest legal basis rather than consent, because there&apos;s nothing personal
          collected to consent to in the first place.
        </p>
      </section>

      <section id="account-tracker" className={styles.section}>
        <h2>Your account and the bike tracker</h2>
        <p>
          Tracking your bike&apos;s service history, mileage, fuel, and running costs requires a free account. We
          use passwordless (&quot;magic link&quot;) sign-in - you enter your email, we send a one-time link, and
          clicking it signs you in. We never ask you to create or remember a password. This processing is carried
          out on the basis that it&apos;s necessary to perform our contract with you to provide the tracker (UK GDPR
          Article 6(1)(b)).
        </p>
        <p>Tied to your email address, we store:</p>
        <ul>
          <li>Your email itself, used only to sign you in and send reminders you&apos;ve asked for</li>
          <li>Your bike&apos;s details (make, model, year, mileage, region)</li>
          <li>Whatever you log against it - services, modifications, fuel fill-ups, insurance/tax/MOT payments, and any reminders you&apos;ve set</li>
          <li>Any receipts or documents you attach (see &quot;Receipt scanning&quot; below)</li>
          <li>A session token in a secure cookie, so you stay signed in between visits</li>
        </ul>
        <p>
          You can export everything you&apos;ve logged as a CSV file directly from your dashboard at any time, and
          you can ask us to delete your account and everything tied to it whenever you like - see &quot;Your
          rights&quot; below.
        </p>
      </section>

      <section id="receipt-scanning" className={styles.section}>
        <h2>Receipt scanning (AI-assisted)</h2>
        <p>
          <Flag>
            This entire section is new - the current live policy doesn&apos;t mention AI-assisted receipt scanning
            at all. It needs to before this page is accurate, since receipt images are personal data (and can
            incidentally contain more - a name or address printed on an invoice, a card&apos;s last four digits,
            etc.) being sent to a third-party AI processor.
          </Flag>
        </p>
        <p>
          When you scan a receipt, the image is sent to <strong>Google&apos;s Gemini AI</strong> to automatically
          read the date, cost, item description, and mileage, so you don&apos;t have to type it in by hand. You
          review and can edit everything it extracts before anything is saved - the AI drafts the entry, it
          doesn&apos;t create it unattended. This is carried out on the basis that it&apos;s necessary to provide
          the tracker feature you&apos;ve asked to use (Article 6(1)(b)), the same basis as the rest of the account.
        </p>
        <p>
          <Flag>
            Confirm which Gemini API tier is actually in use, and add the specific commitment here. This matters a
            lot: Google&apos;s free/consumer-tier Gemini API terms have historically allowed Google to use submitted
            content to improve its own products, while the paid enterprise tier (Vertex AI / paid Gemini API) does
            not train on submitted data by default. If a free tier is in use with real users&apos; receipts, that&apos;s
            a genuine compliance problem to fix, not just a wording problem - switch tiers first, then update this
            paragraph to state plainly that receipt images are not used to train Google&apos;s models.
          </Flag>
        </p>
        <p>
          <Flag>
            State whether the original receipt image is retained after scanning (for your own records, shown back to
            you as an attachment) or discarded once the data is extracted, and for how long. Retention needs an
            actual answer here, not &quot;as long as your account is active&quot; deferred to the general retention
            section.
          </Flag>
        </p>
      </section>

      <section id="vehicle-data" className={styles.section}>
        <h2>Vehicle and registration data</h2>
        <p>
          <Flag>
            This section is also new - not covered anywhere in the current live policy. A vehicle registration
            plate, combined with the keeper/MOT history it unlocks, is personal data when it can be linked back to
            you as the current or a former keeper.
          </Flag>
        </p>
        <p>
          When you add a bike or ask us to refresh its data, we look up its registration plate against DVLA and DVSA
          (MOT history) records to show technical specifications, MOT test results, and - where available on a
          buyer-facing report - keeper-change history. This is carried out on the basis that it&apos;s necessary to
          provide the feature you&apos;ve asked for (Article 6(1)(b)). DVLA and DVSA are themselves independent data
          controllers for their own records; our use of the data they return is governed by their own terms of use
          in addition to this policy.
        </p>
        <p>
          <Flag>
            Confirm the specific DVLA/DVSA API products in use (e.g. Vehicle Enquiry Service, MOT History API) and
            that RoadVerdict&apos;s use - including showing keeper-change history to a prospective buyer who isn&apos;t
            the account holder - is within what those APIs&apos; terms of use actually permit for a service like
            this.
          </Flag>
        </p>
      </section>

      <section id="automated-verdicts" className={styles.section}>
        <h2>How we work out if a price is fair</h2>
        <p>
          When you log a service in the tracker, or use the Quote Checker directly, we compare the price against
          typical UK ranges for that job and engine size, and show a Fair, High, or Second Opinion result. This is a
          straightforward rules-based comparison against a fixed price table - not an AI model, and not a decision
          that has any legal or similarly significant effect on you. It&apos;s guidance, not a verdict on you
          personally, and it&apos;s always fine to disregard it.
        </p>
      </section>

      <section id="story-so-far" className={styles.section}>
        <h2>The Story So Far</h2>
        <p>
          <Flag>
            New section - the &quot;Story So Far&quot; feature generates AI-written prose and isn&apos;t disclosed
            anywhere in the current policy.
          </Flag>
        </p>
        <p>
          If you generate a &quot;Story So Far&quot; for your bike, we first calculate a set of plain facts from
          your logged history ourselves - things like how long you&apos;ve owned it, your total spend by category,
          and your service rhythm. Only those pre-computed facts, never your raw records, receipts, or account
          details, are then sent to an AI model to be turned into readable prose. This is a deliberate design choice
          to limit what leaves our systems for this feature, not an incidental detail.
        </p>
        <p>
          <Flag>
            Name the specific AI provider/model used for this feature (confirm whether it&apos;s the same Gemini
            integration as receipt scanning or a different one) and add the same API-tier / no-training confirmation
            as the receipt scanning section above.
          </Flag>
        </p>
      </section>

      <section id="shareable-reports" className={styles.section}>
        <h2>Shareable reports and buyer requests</h2>
        <p>
          <Flag>
            New section. Anyone with a share link can view a report about your bike without a RoadVerdict account of
            their own - and can submit their own email to request receipts - so this covers a category of person
            (prospective buyers) the rest of this policy doesn&apos;t otherwise mention.
          </Flag>
        </p>
        <p>
          If you generate a shareable report link, anyone with that link can view the bike information and history
          you&apos;ve chosen to include. A prospective buyer viewing a report can request to see specific receipts;
          if they do, we ask for their email address so you can respond to the request and so we can notify them of
          your decision. We don&apos;t use a buyer&apos;s email for anything beyond that specific request.
        </p>
        <p>
          <Flag>
            State how long a share link stays valid, whether it can be revoked early by the account holder, and
            what happens to a buyer&apos;s submitted email and request data after the request is decided
            (retention period needed, not deferred).
          </Flag>
        </p>
      </section>

      <section id="ownership-transfer" className={styles.section}>
        <h2>Ownership transfer (&quot;Passport&quot;) - planned, not built yet</h2>
        <p>
          <Flag>
            Everything in this section describes a feature RoadVerdict does not have today. It exists here as the
            privacy commitments the feature needs to satisfy before it&apos;s built, not a description of anything
            live - written now, deliberately, so the design isn&apos;t decided without this in mind and then
            retrofitted afterward. Replace this entire section with what was actually built, not what was planned,
            once it ships - and get it checked by a solicitor or DPO before it does, given it involves handing one
            private individual&apos;s name and address to a stranger.
          </Flag>
        </p>
        <p>
          The idea: a bike&apos;s logged history is the permanent thing: ownership of <em>access</em> to it transfers
          when the bike is sold, rather than the buyer starting from nothing. Three layers of data are involved, and
          they don&apos;t all move the same way:
        </p>
        <ul>
          <li><strong>Permanent/shareable</strong> - bike identity, registration history, mileage, service history, mods, and any receipts specifically marked shareable. This is what transfers to a new owner.</li>
          <li><strong>Private seller layer</strong> - the seller&apos;s account and payment details, and any private notes. This never transfers, under any circumstance.</li>
          <li><strong>Buyer-owned layer</strong> - the new owner&apos;s own notes, receipts, and plans going forward. Starts empty.</li>
        </ul>
        <p>Before this feature is built, the following need to be true - not just documented, actually true:</p>
        <ul>
          <li>
            A transfer only happens with the seller&apos;s <strong>explicit, specific confirmation at the moment of
            transfer</strong> - not implied by a general terms-of-use clause agreed to at sign-up. The seller sees
            what&apos;s about to move before it moves.
          </li>
          <li>
            <Flag>
              Any document likely to carry the seller&apos;s own personal details - a receipt with their name and
              address printed on it, an insurance certificate, and similar - gets flagged for the seller&apos;s
              review before transfer, using the same AI parsing already used for receipt scanning. This flagging
              doesn&apos;t exist yet and needs building - it&apos;s not a guarantee even once built, so the seller
              can still exclude or redact anything by hand regardless of what the flagging catches.
            </Flag>
          </li>
          <li>
            <Flag>
              The private seller layer is kept structurally separate from what a buyer&apos;s queries can reach -
              enforced at the data layer, not just hidden in the interface - so a future feature or bug can&apos;t
              accidentally expose it. Needs verifying once built, not assumed.
            </Flag>
          </li>
          <li>
            <Flag>
              The consent event itself - what was included, what was excluded, when, confirmed by whom - gets
              recorded, so RoadVerdict can actually demonstrate what happened if it&apos;s ever questioned, not just
              assert it.
            </Flag>
          </li>
        </ul>
        <p>
          A limit worth being upfront with sellers about, not just noting here: once a document has been handed over
          with the seller&apos;s consent, and the buyer holds it as a private individual for their own bike, the
          seller generally can&apos;t compel its deletion afterward - the same as they couldn&apos;t force a buyer to
          shred a paper folder handed over in a private sale today. Transfer-time control, not an ongoing right of
          recall.
        </p>
      </section>

      <section id="reminder-emails" className={styles.section}>
        <h2>Reminder emails</h2>
        <p>
          If you set a reminder (for a service, insurance renewal, MOT, or similar), we email you when it&apos;s
          due, using our email provider, Resend. We only ever email you about reminders you&apos;ve explicitly set -
          no marketing email, and we never share your address with anyone else.
        </p>
      </section>

      <section id="cookies" className={styles.section}>
        <h2>Cookies</h2>
        <p>
          <Flag>
            The current live policy says &quot;one cookie, total.&quot; That needs re-verifying against what the app
            actually sets today - an active-bike selection cookie exists at the backend level even though it has no
            dedicated UI yet, which on its own makes &quot;one cookie&quot; inaccurate. Audit every
            <code> Set-Cookie</code> the app actually issues (including anything set only for admin/impersonation
            sessions) and list every one here by name, purpose, and duration - the table below is a starting
            structure, not a verified list.
          </Flag>
        </p>
        <table className={styles.flagTable}>
          <thead>
            <tr>
              <th>Cookie</th>
              <th>Purpose</th>
              <th>Type</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Session cookie</td>
              <td>Keeps you signed in</td>
              <td>Strictly necessary</td>
              <td><Flag>confirm</Flag></td>
            </tr>
            <tr>
              <td><Flag>Active-bike cookie (confirm real name)</Flag></td>
              <td>Remembers which bike you&apos;re currently viewing</td>
              <td>Strictly necessary</td>
              <td><Flag>confirm</Flag></td>
            </tr>
            <tr>
              <td><Flag>Any others?</Flag></td>
              <td><Flag>audit needed</Flag></td>
              <td><Flag>-</Flag></td>
              <td><Flag>-</Flag></td>
            </tr>
          </tbody>
        </table>
        <p>
          All cookies we use are strictly necessary for the account and tracker to function, so none of them are
          something you can decline while staying signed in. We don&apos;t use advertising or cross-site tracking
          cookies of any kind.
        </p>
      </section>

      <section id="visitor-analytics" className={styles.section}>
        <h2>Visitor and account analytics</h2>
        <p>
          Like most websites, our hosting platform automatically collects basic technical data about visits - pages
          requested, response times, and an approximate location derived from IP address via a free public
          geolocation lookup - to help us keep the site running reliably and understand overall usage. This is
          aggregate technical data, not linked to your name or email.
        </p>
        <p>
          <Flag>
            Separately, the admin dashboard records browser/user-agent information and login timestamps against
            specific accounts (not anonymous, unlike the paragraph above) - this needs its own disclosure here,
            since it doesn&apos;t meet the &quot;not linked to your name or email&quot; description that currently
            covers only the anonymous case.
          </Flag>
        </p>
        <p>
          <Flag>
            Confirm whether Application Insights (used for error monitoring) is configured to scrub personal data
            from request bodies and stack traces before storage, or whether error logs could incidentally contain
            things like email addresses or receipt contents - and disclose accordingly.
          </Flag>
        </p>
      </section>

      <section id="affiliate-links" className={styles.section}>
        <h2>Affiliate links</h2>
        <p>
          Some pages, including the tracker when you log tyres or a chain-and-sprockets job, include links to
          retailers we have an affiliate relationship with, such as moto-tyres.co.uk and GhostBikes.com. If you buy
          something after clicking through, we may earn a small commission - this never changes the price you pay,
          and we receive no information about what you actually purchase.
        </p>
      </section>

      <section id="internal-access" className={styles.section}>
        <h2>Internal access and support</h2>
        <p>
          <Flag>
            New section - not covered at all currently. The admin dashboard includes a feature allowing account
            impersonation for support/debugging purposes; a data subject has a reasonable expectation of knowing
            that&apos;s possible, and it needs disclosing here regardless of how rarely it&apos;s actually used.
          </Flag>
        </p>
        <p>
          A small number of people involved in running RoadVerdict can, where necessary, access account data to
          investigate a support request or fix a technical problem - including, in limited circumstances, viewing
          the site as you would see it to diagnose an issue you&apos;ve reported. This access is limited to what&apos;s
          needed to resolve the specific issue.
        </p>
        <p>
          <Flag>
            Confirm - and only claim here - whether this access is actually logged/audited anywhere. If it isn&apos;t
            yet, either add logging before publishing this claim, or write the honest, weaker version instead of an
            aspirational one.
          </Flag>
        </p>
      </section>

      <section id="data-processors" className={styles.section}>
        <h2>Who processes your data, and where</h2>
        <p>We use a small number of trusted providers to run RoadVerdict, each acting as a data processor under our instructions:</p>
        <ul>
          <li><strong>Microsoft Azure</strong> - UK-hosted (UK West region), stores account and tracker data, receipt attachments, and application logs</li>
          <li><strong>Google (Gemini AI)</strong> - <Flag>processes receipt images and Story So Far facts; add region/transfer detail once the API tier above is confirmed</Flag></li>
          <li><strong>DVLA / DVSA</strong> - <Flag>vehicle and MOT history lookups; confirm exact API products in use</Flag></li>
          <li><strong>Resend</strong> - sends magic-link and reminder emails, built on infrastructure that may process data outside the UK; where that happens, it&apos;s covered by standard contractual clauses or an equivalent safeguard recognised under UK GDPR</li>
          <li><strong>ip-api.com</strong> - free public geolocation lookup, visitor analytics only</li>
          <li><Flag>Google Fonts - confirm whether fonts are self-hosted or loaded from Google&apos;s CDN at request time; the latter transmits visitor IP addresses to Google and would need disclosing here</Flag></li>
        </ul>
        <p>None of these providers use your data for their own purposes beyond what&apos;s stated above - only to help us provide RoadVerdict to you.</p>
      </section>

      <section id="international-transfers" className={styles.section}>
        <h2>International data transfers</h2>
        <p>
          <Flag>
            New dedicated section - international transfers were previously only mentioned in passing under Resend.
            UK GDPR requires an appropriate safeguard (adequacy regulations, standard contractual clauses, or
            equivalent) for every processor that may handle personal data outside the UK, and each one needs to be
            named, not just the general concept.
          </Flag>
        </p>
        <p>
          Some of our processors - <Flag>list them explicitly once confirmed (likely Google, and Resend)</Flag> -
          may process data outside the UK. Where that happens, we rely on standard contractual clauses or another
          transfer mechanism recognised under UK GDPR to keep your data protected to a UK standard regardless of
          where it&apos;s processed.
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
        </ul>
        <p>
          <Flag>
            Add, once genuinely true: a documented incident response process with a target timeline for notifying
            affected users and the ICO (see &quot;If something goes wrong&quot; below - that section commits to 72
            hours, which needs an actual internal process behind it to be a credible promise, not just words on this
            page); confirmation of who has production access and on what basis (least-privilege); and whether
            backups exist and how they&apos;re protected.
          </Flag>
        </p>
      </section>

      <section id="retention" className={styles.section}>
        <h2>How long we keep data</h2>
        <p>
          <Flag>
            The current policy only says &quot;as long as your account is active,&quot; with no period after
            deletion or inactivity. An enterprise-grade policy states actual numbers per category - the rows below
            need real answers, not placeholders, before publishing.
          </Flag>
        </p>
        <table className={styles.flagTable}>
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
              <td><Flag>decide and state a period, e.g. &quot;deleted within 30 days&quot;</Flag></td>
            </tr>
            <tr>
              <td>Backups containing deleted account data</td>
              <td><Flag>decide and state a period</Flag></td>
            </tr>
            <tr>
              <td>Receipt images sent for AI scanning</td>
              <td><Flag>decide and state - see &quot;Receipt scanning&quot;</Flag></td>
            </tr>
            <tr>
              <td>Share link tokens and buyer receipt requests</td>
              <td><Flag>decide and state - see &quot;Shareable reports&quot;</Flag></td>
            </tr>
            <tr>
              <td>Anonymised Quote Checker data</td>
              <td>Indefinitely - no personal identifiers exist to delete</td>
            </tr>
            <tr>
              <td>Server/application logs</td>
              <td><Flag>decide and state a period</Flag></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="childrens-privacy" className={styles.section}>
        <h2>Children&apos;s privacy</h2>
        <p>
          RoadVerdict isn&apos;t directed at children, and we don&apos;t knowingly collect data from anyone under
          13. If you believe a child has provided us with personal data, contact us and we&apos;ll delete it.
        </p>
      </section>

      <section id="automated-decisions" className={styles.section}>
        <h2>Automated decision-making</h2>
        <p>
          RoadVerdict uses some automated processing - the Fair/High/Second Opinion price comparison, and AI
          assistance for reading receipts and drafting the Story So Far summary. None of this results in a decision
          that produces legal effects or similarly significantly affects you: every AI-drafted entry can be reviewed
          and edited before it&apos;s saved, and the price comparison is guidance you&apos;re always free to
          disregard. You won&apos;t be automatically refused service, charged differently, or have anything decided
          about you without a person being able to review it.
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
          To exercise any of these, email us - see Contact below. We&apos;ll respond within one month, as required
          by law. You can also complain to the UK Information Commissioner&apos;s Office if you&apos;re unhappy with
          how we&apos;ve handled your data: <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener">ico.org.uk/make-a-complaint</a>,
          or by phone on 0303 123 1113.
        </p>
      </section>

      <section id="breach-notification" className={styles.section}>
        <h2>If something goes wrong</h2>
        <p>
          If a personal data breach occurs that&apos;s likely to result in a risk to your rights and freedoms,
          we&apos;ll notify the ICO within 72 hours of becoming aware of it, as required by UK GDPR. Where a breach
          is likely to result in a <em>high</em> risk to you specifically, we&apos;ll also notify you directly,
          without undue delay.
        </p>
        <p>
          <Flag>
            This is a legal commitment with a hard deadline - it needs an actual internal process behind it (who
            gets notified internally, how a breach gets assessed and escalated, who drafts the ICO notification)
            before it&apos;s safe to publish as a promise rather than just a statement of the law.
          </Flag>
        </p>
      </section>

      <section id="changes" className={styles.section}>
        <h2>Changes to this policy</h2>
        <p>
          If this policy changes materially, we&apos;ll update the date at the top of this page. Continuing to use
          RoadVerdict after a change means you accept the updated version.
        </p>
        <p>
          <Flag>
            Consider also committing to email account holders about material changes, not just updating the date
            silently - only add this if you&apos;re confident you&apos;ll actually remember to do it every time.
          </Flag>
        </p>
      </section>

      <section id="governing-law" className={styles.section}>
        <h2>Governing law</h2>
        <p>
          This policy, and your use of RoadVerdict, is governed by the laws of England and Wales.{' '}
          <Flag>Confirm this is correct if the controller is actually based elsewhere in the UK or outside it.</Flag>
        </p>
      </section>

      <section id="contact" className={styles.section}>
        <h2>Contact</h2>
        <p>
          Questions about this policy, or want to exercise any of the rights above? Email us directly at{' '}
          <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>.
        </p>
      </section>

      <p className={styles.footerNote}>
        RoadVerdict is guidance benchmarked against typical prices, not a professional inspection. This page is a
        drafting aid, not legal advice - have the final version reviewed by a solicitor or UK GDPR consultant before
        publishing, particularly the sections above still marked for review.
      </p>
    </div>
  );
}
