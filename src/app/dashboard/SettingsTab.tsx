// Place at: src/app/dashboard/SettingsTab.tsx
//
// Nothing here is vehicle-specific - display name, avatar, 2FA, account
// deletion, and feedback are all account-level, not per-bike/per-car -
// so this one component is reused verbatim for both bike and car
// dashboards, unlike almost every other tab's content in this app.
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TwoFactorSettings } from './TwoFactorSettings';
import { DeleteAccountModal } from './DeleteAccountModal';
import styles from './dashboard.module.css';

type FeedbackType = 'feature' | 'bug' | 'other';

interface Props {
  email: string;
  displayName: string;
  hasAvatar: boolean;
  initiallyEnabled: boolean;
  pendingDeletion: { deleteAfterLabel: string } | null;
}

export function SettingsTab({ email, displayName: initialDisplayName, hasAvatar: initialHasAvatar, initiallyEnabled, pendingDeletion }: Props) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  const [hasAvatar, setHasAvatar] = useState(initialHasAvatar);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // Cache-busts the <img> src after a change - without this, the
  // browser would keep showing a just-replaced or just-removed image
  // from its own cache, since the URL itself never changes.
  const [avatarVersion, setAvatarVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [feedbackType, setFeedbackType] = useState<FeedbackType>('feature');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameError(null);
    setNameSaved(false);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNameError(data.error ?? 'Could not save your name.');
        return;
      }
      setNameSaved(true);
      router.refresh();
    } catch {
      setNameError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setSavingName(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/account/avatar', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setAvatarError(data.error ?? 'Could not upload your photo.');
        return;
      }
      setHasAvatar(true);
      setAvatarVersion((v) => v + 1);
      router.refresh();
    } catch {
      setAvatarError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setAvatarError(data.error ?? 'Could not remove your photo.');
        return;
      }
      setHasAvatar(false);
      setAvatarVersion((v) => v + 1);
      router.refresh();
    } catch {
      setAvatarError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleSendFeedback(e: React.FormEvent) {
    e.preventDefault();
    setSendingFeedback(true);
    setFeedbackError(null);
    setFeedbackSent(false);
    try {
      const res = await fetch('/api/account/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: feedbackType, message: feedbackMessage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackError(data.error ?? 'Could not send your feedback.');
        return;
      }
      setFeedbackSent(true);
      setFeedbackMessage('');
    } catch {
      setFeedbackError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setSendingFeedback(false);
    }
  }

  async function handleCancelDeletion() {
    setCancellingDeletion(true);
    try {
      await fetch('/api/account/cancel-deletion', { method: 'POST' });
      router.refresh();
    } finally {
      setCancellingDeletion(false);
    }
  }

  const initials = (displayName || email).trim().slice(0, 2).toUpperCase();

  return (
    <>
      <h1 className={styles.heading}>Settings</h1>
      <p className={styles.subtext}>Manage your profile, sign-in security, and account.</p>

      <section style={{ marginTop: '1.6rem' }}>
        <h2 className={styles.chartCardTitle}>Profile</h2>
        <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', marginTop: '0.8rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            {hasAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={avatarVersion}
                src={`/api/account/avatar?v=${avatarVersion}`}
                alt="Your avatar"
                width={72}
                height={72}
                style={{ borderRadius: '50%', objectFit: 'cover', width: '72px', height: '72px' }}
              />
            ) : (
              <div className={styles.sidebarUserAvatar} style={{ width: '72px', height: '72px', fontSize: '1.5rem' }}>
                {initials}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className={styles.iconBtn} disabled={avatarBusy} onClick={() => fileInputRef.current?.click()}>
                {hasAvatar ? 'Change' : 'Upload'}
              </button>
              {hasAvatar && (
                <button type="button" className={styles.iconBtn} disabled={avatarBusy} onClick={handleRemoveAvatar}>
                  Remove
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarUpload}
              style={{ display: 'none' }}
              aria-label="Upload avatar photo"
            />
          </div>
          <form onSubmit={handleSaveName} style={{ flex: 1, minWidth: '220px' }}>
            <div className="field">
              <label htmlFor="settings-display-name">Your name</label>
              <input
                id="settings-display-name"
                type="text"
                maxLength={60}
                placeholder="e.g. Alex"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setNameSaved(false); }}
                style={{ width: '100%', maxWidth: '260px', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '4px' }}
              />
            </div>
            <p className="field-note" style={{ marginTop: '0.4rem' }}>
              Used by the AI assistant to address you by name - leave blank to skip this.
            </p>
            <button type="submit" className={styles.iconBtn} disabled={savingName} style={{ marginTop: '0.5rem' }}>
              {savingName ? 'Saving…' : 'Save name'}
            </button>
            {nameSaved && <span style={{ marginLeft: '0.6rem', color: 'var(--verdict-green)' }}>Saved.</span>}
          </form>
        </div>
        {avatarError && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{avatarError}</p>}
        {nameError && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{nameError}</p>}
      </section>

      <hr className="ticket__divider" style={{ margin: '1.6rem 0' }} />

      <section>
        <h2 className={styles.chartCardTitle}>Security</h2>
        <p className={styles.subtext} style={{ marginBottom: '0.8rem' }}>Manage how you sign in to your account.</p>
        <TwoFactorSettings initiallyEnabled={initiallyEnabled} />
      </section>

      <hr className="ticket__divider" style={{ margin: '1.6rem 0' }} />

      <section>
        <h2 className={styles.chartCardTitle}>Feature request / report a bug</h2>
        <form onSubmit={handleSendFeedback} style={{ marginTop: '0.8rem', maxWidth: '480px' }}>
          <div className="field">
            <label htmlFor="settings-feedback-type">Type</label>
            <select id="settings-feedback-type" value={feedbackType} onChange={(e) => setFeedbackType(e.target.value as FeedbackType)}>
              <option value="feature">Feature request</option>
              <option value="bug">Bug report</option>
              <option value="other">Something else</option>
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.8rem' }}>
            <label htmlFor="settings-feedback-message">Message</label>
            <textarea
              id="settings-feedback-message"
              rows={4}
              required
              value={feedbackMessage}
              onChange={(e) => { setFeedbackMessage(e.target.value); setFeedbackSent(false); }}
              placeholder="What happened, or what would you like to see?"
            />
          </div>
          {feedbackError && <p className="error-text" role="alert">{feedbackError}</p>}
          <button type="submit" className={styles.iconBtn} disabled={sendingFeedback} style={{ marginTop: '0.7rem' }}>
            {sendingFeedback ? 'Sending…' : 'Send'}
          </button>
          {feedbackSent && <span style={{ marginLeft: '0.6rem', color: 'var(--verdict-green)' }}>Thanks, we&apos;ve got it.</span>}
        </form>
      </section>

      <hr className="ticket__divider" style={{ margin: '1.6rem 0' }} />

      <section>
        <h2 className={styles.chartCardTitle}>Delete account</h2>
        {pendingDeletion ? (
          <div className={styles.budgetWarningBanner} style={{ marginTop: '0.8rem', maxWidth: '480px' }}>
            <strong>Deletion pending</strong> - your account will be permanently deleted on {pendingDeletion.deleteAfterLabel}.
            <div style={{ marginTop: '0.6rem' }}>
              <button type="button" className={styles.iconBtn} disabled={cancellingDeletion} onClick={handleCancelDeletion}>
                {cancellingDeletion ? 'Cancelling…' : 'Cancel deletion'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.subtext} style={{ marginTop: '0.5rem', maxWidth: '480px' }}>
              Permanently deletes your account and everything logged on it - your bikes or cars,
              service history, receipts, everything. There&apos;s a 30-day grace period first, so
              this isn&apos;t immediate.
            </p>
            <button type="button" className={styles.iconBtn} style={{ marginTop: '0.7rem', borderColor: 'var(--verdict-red)', color: 'var(--verdict-red)' }} onClick={() => setDeleteModalOpen(true)}>
              Delete my account
            </button>
          </>
        )}
      </section>

      {deleteModalOpen && <DeleteAccountModal onClose={() => setDeleteModalOpen(false)} />}
    </>
  );
}
