// Place at: src/app/dashboard/ExportShareSection.tsx
'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

export function ExportShareSection() {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGetLink() {
    setLoading(true);
    try {
      const res = await fetch('/api/tracker/share-link', { method: 'POST' });
      const data = await res.json();
      if (res.ok) setShareUrl(data.url);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.chartCard} style={{ marginBottom: '1.6rem' }}>
      <div className={styles.chartCardTitle}>Export & share</div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <a href="/api/tracker/export/csv" className="submit-button" style={{ textDecoration: 'none' }}>
          Download CSV
        </a>
        {!shareUrl ? (
          <button type="button" className="submit-button" onClick={handleGetLink} disabled={loading}>
            {loading ? 'Generating…' : 'Get shareable report link'}
          </button>
        ) : (
          <>
            <input
              readOnly
              value={shareUrl}
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '0.5rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                border: '1px solid var(--border)',
                borderRadius: '4px',
              }}
            />
            <button type="button" className={styles.iconBtn} onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </>
        )}
      </div>
      <p className={styles.emptyNote} style={{ marginTop: '0.6rem' }}>
        The report link doesn&apos;t require signing in - safe to share with a buyer. It never
        includes your email or fuel spending.
      </p>
    </div>
  );
}
