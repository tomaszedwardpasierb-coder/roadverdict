// Place at: src/app/dashboard/StorySoFarTab.tsx
'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

export function StorySoFarTab() {
  const [clicked, setClicked] = useState(false);

  return (
    <div className={styles.storyIntro}>
      <h1 className={styles.storyTitle}>The Story So Far</h1>
      <p className={styles.storyText}>
        What your logged history says about this bike - where it&apos;s strong, where a bit more logging would
        strengthen it, and the same story you can hand a buyer when you&apos;re ready to sell, backed by real dates
        and receipts, not just your word.
      </p>
      <button type="button" className="submit-button" onClick={() => setClicked(true)}>
        Generate my story →
      </button>
      {clicked && (
        <p className={styles.storyComingSoon}>
          This is coming soon - it&apos;ll be a premium feature once it&apos;s ready. Keep logging in the meantime;
          every entry and receipt you add now makes the story it eventually tells stronger.
        </p>
      )}
    </div>
  );
}
