// Place at: src/app/dashboard/StorySoFarTab.tsx
'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import { convertMilesToDisplay, type DistanceUnit } from '@/lib/tracker/unitFormat';
import type { EvidenceQuality } from '@/lib/tracker/evidenceQuality';
import type { SellerPrepIssue, PrepStep } from '@/lib/tracker/sellerPrep';
import type { UpcomingCostItem } from '@/lib/tracker/upcomingCosts';
import styles from './dashboard.module.css';

interface StoryResponse {
  generatedWithAi: boolean;
  sharedStory: string[];
  ownerNotes: string[];
  verdict: { tier: string; label: string; reasons: string[] };
  generatedAt: string;
  cached: boolean;
  nextAvailableAt: string;
}

// Deterministic, no AI, no weekly cooldown - computed fresh on every
// dashboard load in page.tsx (see sellerPrep.ts), unlike the cached
// story above. Rendered unconditionally, not gated behind whether a
// story has ever been generated - a new owner should see where their
// record stands without needing to spend a weekly AI generation first.
interface SellerPrepData {
  evidenceQuality: EvidenceQuality;
  prepIssues: SellerPrepIssue[];
  upcomingCostItems: UpcomingCostItem[];
  likelyQuestions: string[];
  prepPlan: PrepStep[];
}

interface Props {
  bikeNickname?: string;
  registration?: string;
  currentMileage: number;
  distanceUnit: DistanceUnit;
  // The bike's already-saved story, passed straight from page.tsx
  // (which already has bike.storyCache loaded as part of the normal
  // page data) rather than fetched again client-side. This is what
  // makes the story persist across a sign-out/sign-in or any other
  // fresh page load - previously this component always started blank
  // and needed an explicit click just to check whether one existed,
  // which looked exactly like the cooldown had reset even when it
  // genuinely hadn't.
  initialStory: StoryResponse | null;
  sellerPrep: SellerPrepData;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeLeftText(nextAvailableAt: string): string {
  const msLeft = new Date(nextAvailableAt).getTime() - Date.now();
  if (msLeft <= 0) return '';
  const daysLeft = Math.ceil(msLeft / 86400000);
  const hoursLeft = Math.ceil(msLeft / 3600000);
  return daysLeft > 1 ? `${daysLeft} days` : hoursLeft > 1 ? `${hoursLeft} hours` : 'less than an hour';
}

// Rendered from both of StorySoFarTab's return branches below, rather
// than duplicated JSX in each - same content either way, whether or
// not an AI story has been generated yet.
function SellerPrepSection({ data }: { data: SellerPrepData }) {
  const { evidenceQuality, prepIssues, upcomingCostItems, likelyQuestions, prepPlan } = data;

  return (
    <div style={{ marginTop: '2rem', paddingTop: '1.6rem', borderTop: '1px solid var(--border)' }}>
      <h2 className={styles.sectionHeading}>Getting ready to sell</h2>
      <p className={styles.subtext} style={{ marginBottom: '1.2rem' }}>
        A buyer opening a share link sees this exact record, read the same way - here&apos;s how it currently
        looks, and what&apos;s worth doing before you list it.
      </p>

      {evidenceQuality.totalRecords === 0 ? (
        <p className={styles.subtext}>
          Nothing logged yet - start adding your service history, fuel, and bills to build the record a buyer
          will eventually see here.
        </p>
      ) : (
        <>
          <p className={styles.subtext} style={{ fontWeight: 600, marginBottom: '0.3rem' }}>Your record so far</p>
          <p className={styles.subtext}>
            {evidenceQuality.totalRecords} entries logged, {evidenceQuality.receiptCoveragePct}% with a receipt
            attached, {evidenceQuality.realTimePct}% entered in real time.
          </p>
          <p className={styles.subtext} style={{ marginBottom: '1.2rem' }}>
            {evidenceQuality.mileageInternallyConsistent
              ? 'No conflicting mileage readings across your logged entries.'
              : 'At least one logged entry shows a lower mileage than an earlier one - worth checking for a typo.'}
          </p>

          {prepIssues.length > 0 && (
            <>
              <p className={styles.subtext} style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                Worth addressing before you list
              </p>
              {prepIssues.map((issue, i) => (
                <div key={i} className={styles.reviewQueueDuplicateWarning} style={{ marginBottom: '0.6rem' }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.2rem' }}>{issue.label}</p>
                  <p style={{ margin: '0 0 0.3rem' }}>{issue.detail}</p>
                  <p style={{ margin: 0, fontStyle: 'italic' }}>{issue.suggestion}</p>
                </div>
              ))}
            </>
          )}

          {upcomingCostItems.length > 0 && (
            <>
              <p className={styles.subtext} style={{ fontWeight: 600, marginTop: '1rem', marginBottom: '0.5rem' }}>
                What a buyer&apos;s report will show as coming up
              </p>
              <ul style={{ margin: '0 0 1rem', paddingLeft: '1.2rem' }}>
                {upcomingCostItems.map((item, i) => (
                  <li key={i} className={styles.subtext} style={{ marginBottom: '0.3rem' }}>
                    <strong>{item.label}</strong> - {item.timingDetail} ({item.timing === 'overdue' ? 'overdue' : 'due soon'})
                    {item.pricing.status === 'priced' && (
                      <> - typically £{item.pricing.low}-£{item.pricing.high}</>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {likelyQuestions.length > 0 && (
            <>
              <p className={styles.subtext} style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                Questions a buyer is likely to ask - have your answers ready
              </p>
              <ul style={{ margin: '0 0 1rem', paddingLeft: '1.2rem' }}>
                {likelyQuestions.map((q, i) => (
                  <li key={i} className={styles.subtext} style={{ marginBottom: '0.3rem' }}>{q}</li>
                ))}
              </ul>
            </>
          )}

          <p className={styles.subtext} style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Your prep checklist</p>
          <ol style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {prepPlan.map((step, i) => (
              <li key={i} className={styles.subtext} style={{ marginBottom: '0.4rem' }}>
                <strong>{step.stage}:</strong> {step.detail}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

export function StorySoFarTab({ bikeNickname, registration, currentMileage, distanceUnit, initialStory, sellerPrep }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [story, setStory] = useState<StoryResponse | null>(initialStory);

  // Same tag shown next to every other tab's page title - built the
  // same way page.tsx builds it, since this component doesn't have
  // direct access to the bike doc itself, only what's passed in.
  const bikeTag = (bikeNickname || registration) ? (
    <span className={styles.headingBikeTag}>
      {bikeNickname}
      {bikeNickname && registration && " · "}
      {registration}
    </span>
  ) : null;
  const mileagePill = (
    <div className={styles.headerMileagePill}>
      <Icon name="currentMiles" size={15} />
      {Math.round(convertMilesToDisplay(currentMileage, distanceUnit)).toLocaleString()} {distanceUnit === "km" ? "km" : "mi"}
    </div>
  );

  // Recomputed on every render, which is enough for something with
  // day-scale granularity - no need for a live ticking countdown for
  // a cooldown measured in days, and any state change (including just
  // re-rendering) re-evaluates this against the real clock anyway.
  const canRegenerate = !story || new Date(story.nextAvailableAt).getTime() <= Date.now();

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tracker/story-so-far');
      const data = await res.json();
      if (res.ok) {
        setStory(data);
      } else {
        setError(data.error ?? 'Could not generate the story. Try again.');
      }
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!story) {
    return (
      <div className={styles.storyIntro}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
          <h1 className={styles.heading}>The Story So Far{bikeTag}</h1>
          {mileagePill}
        </div>
        <p className={styles.subtext}>
          What your logged history says about this bike - where it&apos;s strong, where a bit more logging would
          strengthen it, and the same story you can hand a buyer when you&apos;re ready to sell, backed by real dates
          and receipts, not just your word.
        </p>
        <div className={styles.storyReadinessNote}>
          Best used once you&apos;ve built up a decent spread of history with receipts and supporting documents
          attached, rather than straight after adding the bike. If you run it too early, when there are only a
          handful of entries, the result is likely to have little or no real value. It may simply come back as
          &quot;Limited documentation&quot;, or produce a summary that doesn&apos;t tell the bike&apos;s story
          properly at all, regardless of how good its actual history is.
        </div>
        <button type="button" className={styles.scanReceiptBtn} disabled={loading} onClick={handleGenerate}>
          {loading ? 'Putting it together…' : 'Generate my story →'}
        </button>
        {error && <p className="error-text" role="alert" style={{ marginTop: '0.8rem' }}>{error}</p>}
        <SellerPrepSection data={sellerPrep} />
      </div>
    );
  }

  return (
    <div className={styles.storyIntro}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 className={styles.heading}>The Story So Far{bikeTag}</h1>
        {mileagePill}
      </div>
      <p className={styles.subtext} style={{ marginBottom: '0.3rem' }}>
        Documentation: <strong>{story.verdict.label}</strong>
      </p>
      {/* Always visible, not just after clicking Regenerate - the whole
          point is knowing at a glance whether this is fresh or old
          without having to guess or test the button first. */}
      <p className={styles.subtext} style={{ marginBottom: '1.2rem', fontSize: '0.8rem' }}>
        Generated {formatDate(story.generatedAt)}
      </p>

      {story.sharedStory.map((paragraph, i) => (
        <p key={i} className={styles.storyText}>
          {paragraph}
        </p>
      ))}

      {story.ownerNotes.length > 0 && (
        <div className={styles.reviewQueueDuplicateWarning} style={{ marginTop: '1.4rem' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>For you only - never shown to a buyer</p>
          {story.ownerNotes.map((note, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '0.5rem 0 0' }}>
              {note}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        className={styles.iconBtn}
        style={{ marginTop: '1.4rem' }}
        onClick={handleGenerate}
        disabled={loading || !canRegenerate}
      >
        {loading ? 'Putting it together…' : 'Regenerate'}
      </button>
      {/* Shown upfront whenever it's locked, not discovered by clicking
          a button that turns out not to do anything - a disabled
          button with no explanation is worse than no button at all. */}
      {!canRegenerate && (
        <p className={styles.subtext} style={{ marginTop: '0.6rem', marginBottom: 0 }}>
          Stories refresh once a week to keep AI use sensible. Next refresh available in {timeLeftText(story.nextAvailableAt)}.
        </p>
      )}
      {error && <p className="error-text" role="alert" style={{ marginTop: '0.6rem' }}>{error}</p>}
      <SellerPrepSection data={sellerPrep} />
    </div>
  );
}
