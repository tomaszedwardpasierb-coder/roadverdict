// Place at: src/app/dashboard/StorySoFarTab.tsx
'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

interface StoryResponse {
  generatedWithAi: boolean;
  sharedStory: string[];
  ownerNotes: string[];
  verdict: { tier: string; label: string; reasons: string[] };
}

export function StorySoFarTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [story, setStory] = useState<StoryResponse | null>(null);

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
        <h1 className={styles.storyTitle}>The Story So Far</h1>
        <p className={styles.storyText}>
          What your logged history says about this bike - where it&apos;s strong, where a bit more logging would
          strengthen it, and the same story you can hand a buyer when you&apos;re ready to sell, backed by real dates
          and receipts, not just your word.
        </p>
        <button type="button" className="submit-button" disabled={loading} onClick={handleGenerate}>
          {loading ? 'Putting it together…' : 'Generate my story →'}
        </button>
        {error && <p className="error-text" role="alert" style={{ marginTop: '0.8rem' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.storyIntro}>
      <h1 className={styles.storyTitle}>The Story So Far</h1>
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

      <button type="button" className={styles.iconBtn} style={{ marginTop: '1.4rem' }} onClick={handleGenerate} disabled={loading}>
        {loading ? 'Putting it together…' : 'Regenerate'}
      </button>
    </div>
  );
}
