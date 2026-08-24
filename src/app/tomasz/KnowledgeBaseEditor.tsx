// Place at: src/app/tomasz/KnowledgeBaseEditor.tsx
'use client';

import { useState } from 'react';
import styles from './adminShell.module.css';

interface KnowledgeBaseVersion {
  id: string;
  content: string;
  savedAt: string;
}

interface Props {
  initialContent: string;
  initialUpdatedAt: string;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Editing this text is the entire point of moving the knowledge base
// into the database - see assistantConfig.ts. Saving here takes effect
// on the very next question anyone asks the live assistant, with no
// build or code review afterward, so the confirm() before saving and
// the version history below are the only safety net that used to come
// from a git diff and a review before deploy.
export function KnowledgeBaseEditor({ initialContent, initialUpdatedAt }: Props) {
  const [content, setContent] = useState(initialContent);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<KnowledgeBaseVersion[] | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const dirty = content !== initialContent;

  async function handleSave() {
    if (!confirm("Save this as the assistant's live knowledge base? This takes effect immediately for every user - there's no review step after this.")) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/tomasz/assistant-config/knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Save failed');
      }
      setUpdatedAt(new Date().toISOString());
      setVersions(null);
      setMessage('Saved - live now.');
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (versions) return;
    setLoadingVersions(true);
    try {
      const res = await fetch('/api/tomasz/assistant-config/knowledge-base/versions');
      const data = await res.json();
      setVersions(data.versions ?? []);
    } catch {
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  }

  function loadVersion(v: KnowledgeBaseVersion) {
    if (dirty && !confirm('You have unsaved changes in the editor - loading this version will discard them. Continue?')) {
      return;
    }
    setContent(v.content);
    setShowHistory(false);
    setMessage(`Loaded the version from ${fmtDate(v.savedAt)} into the editor - not saved yet, review and click Save to make it live.`);
  }

  return (
    <div className={styles.card} style={{ marginBottom: '1.5rem' }}>
      <div className={styles.cardTitle}>Knowledge base</div>
      <p className={styles.warnNote} style={{ marginBottom: '0.6rem' }}>
        The assistant&apos;s full source of truth - what it knows about RoadVerdict and how it&apos;s allowed to
        answer. Saving here takes effect immediately for every user, with no build or review step, so double-check
        before saving. Every save keeps the previous version below, so a bad edit is a quick revert rather than a
        scramble.
      </p>
      <p className={styles.note} style={{ marginBottom: '0.6rem' }}>Last updated {fmtDate(updatedAt)}</p>
      <textarea
        className={styles.input}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%',
          minHeight: '420px',
          fontFamily: '"Cascadia Code", Consolas, "SF Mono", monospace',
          fontSize: '0.8rem',
          lineHeight: 1.5,
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className={styles.button} onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Saving...' : 'Save (goes live immediately)'}
        </button>
        <button type="button" className={styles.buttonSecondary} onClick={toggleHistory}>
          {showHistory ? 'Hide version history' : 'View version history'}
        </button>
        {message && <span className={styles.note}>{message}</span>}
      </div>

      {showHistory && (
        <div style={{ marginTop: '0.8rem', borderTop: '1px solid var(--admin-border)', paddingTop: '0.8rem' }}>
          {loadingVersions ? (
            <p className={styles.note}>Loading versions...</p>
          ) : versions && versions.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Saved</th>
                  <th>Length</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td>{fmtDate(v.savedAt)}</td>
                    <td>{v.content.length.toLocaleString()} chars</td>
                    <td>
                      <button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={() => loadVersion(v)}>
                        Load into editor
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.warnNote}>No earlier versions yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
