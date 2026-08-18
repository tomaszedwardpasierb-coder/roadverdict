// Place at: src/app/dashboard/StorySoFarTab.tsx
'use client';

import { useState } from 'react';
import { Icon } from './Icon';
import { convertMilesToDisplay, type DistanceUnit } from '@/lib/tracker/unitFormat';
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

export function StorySoFarTab({ bikeNickname, registration, currentMileage, distanceUnit, initialStory }: Props) {
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
    </div>
  );
}
