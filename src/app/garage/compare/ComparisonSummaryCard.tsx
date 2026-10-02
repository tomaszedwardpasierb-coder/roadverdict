// Place at: src/app/garage/compare/ComparisonSummaryCard.tsx
//
// The AI-written summary above the comparison table (see
// comparisonSummary.ts). Shows a saved one straight away if it still
// matches the data; otherwise offers to write one - only on a click, so
// visiting the page never costs an AI call by itself.
'use client';

import { useEffect, useState } from 'react';
import styles from '../garage.module.css';

type Summary = { summary: string; points: string[]; generatedAt: string };

export function ComparisonSummaryCard({ ids, from, to }: { ids: string[]; from?: string; to?: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [checking, setChecking] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(generate: boolean): Promise<void> {
    try {
      const res = await fetch('/api/compare/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, from, to, generate }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (generate) setError(data.error ?? 'The summary couldn’t be written just now.');
        return;
      }
      setSummary(data.summary ?? null);
    } catch {
      if (generate) setError('Could not reach the server.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    setSummary(null);
    fetch('/api/compare/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, from, to, generate: false }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setSummary(data.summary ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ids, from, to]);

  async function write() {
    setWriting(true);
    setError(null);
    await request(true);
    setWriting(false);
  }

  if (checking) return null;

  if (summary) {
    return (
      <div className={styles.compareSummary}>
        <p>{summary.summary}</p>
        {summary.points.length > 0 && (
          <ul>
            {summary.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}
        <p className="field-note" style={{ margin: 0 }}>
          Written by AI from the figures below.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '0.8rem' }}>
      <button type="button" className="submit-button" onClick={write} disabled={writing}>
        {writing ? 'Writing…' : 'Write a summary'}
      </button>
      <span className="field-note" style={{ marginLeft: '0.6rem' }}>
        A short AI-written read of these figures: what’s cheaper to run, what’s used most, and why.
      </span>
      {error && (
        <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>
          {error}
        </p>
      )}
    </div>
  );
}
