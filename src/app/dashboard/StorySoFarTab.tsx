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
  cached: boolean;
  nextAvailableAt: string;
}

interface Props {
  bikeNickname?: string;
  registration?: string;
  currentMileage: number;
  distanceUnit: DistanceUnit;
}

export function StorySoFarTab({ bikeNickname, registration, currentMileage, distanceUnit }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [story, setStory] = useState<StoryResponse | null>(null);
  // Only ever set from an explicit "Regenerate" click that came back
  // cached - never on the first "Generate my story" click, even if
  // that one happens to return a still-fresh cached story too. Seeing
  // your own recent story shouldn't come with a cooldown notice; only
  // explicitly asking for another one within the week should.
  const [cooldownNotice, setCooldownNotice] = useState<string | null>(null);

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

  async function handleGenerate(isRegenerateClick: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tracker/story-so-far');
      const data = await res.json();
      if (res.ok) {
        setStory(data);
        if (isRegenerateClick && data.cached) {
          const msLeft = new Date(data.nextAvailableAt).getTime() - Date.now();
          const daysLeft = Math.ceil(msLeft / 86400000);
          const hoursLeft = Math.ceil(msLeft / 3600000);
          const timeLeftText = daysLeft > 1 ? `${daysLeft} days` : hoursLeft > 1 ? `${hoursLeft} hours` : 'less than an hour';
          setCooldownNotice(
            `Stories refresh once a week to keep AI use sensible - this is still your most recent one. Next refresh available in ${timeLeftText}.`
          );
        } else {
          setCooldownNotice(null);
        }
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
        <button type="button" className={styles.scanReceiptBtn} disabled={loading} onClick={() => handleGenerate(false)}>
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
      <p className={styles.subtext} style={{ marginBottom: '1.2rem' }}>
        Documentation: <strong>{story.verdict.label}</strong>
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

      <button type="button" className={styles.iconBtn} style={{ marginTop: '1.4rem' }} onClick={() => handleGenerate(true)} disabled={loading}>
        {loading ? 'Putting it together…' : 'Regenerate'}
      </button>
      {cooldownNotice && (
        <p className={styles.subtext} style={{ marginTop: '0.6rem', marginBottom: 0 }}>
          {cooldownNotice}
        </p>
      )}
    </div>
  );
}
