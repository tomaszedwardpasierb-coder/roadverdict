// Place at: src/app/dashboard/NotificationBell.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { NotificationDoc } from '@/lib/tracker/notification';

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Whether to anchor the dropdown's right edge to the bell (extending
  // leftward) rather than its left edge (extending rightward) - decided
  // fresh every time the dropdown opens, from the bell's own actual
  // position on screen at that moment, rather than assumed from which
  // part of the layout it's rendered in. The same markup lands in a
  // genuinely different spot depending on viewport width (a header row
  // that wraps on a narrow screen puts the bell near the left edge,
  // even though on a wide screen the identical markup puts it near the
  // right) - measuring directly is correct regardless of that, without
  // needing to know in advance where it'll end up.
  const [anchorRight, setAnchorRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tracker/notifications');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
          setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0);
        }
      } catch {
        // Silent - a failed notification fetch shouldn't block or
        // disrupt the rest of the dashboard loading normally around it.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleMarkAllRead() {
    // Updates the visible state immediately rather than waiting on the
    // network - the count and list are already correct from the
    // person's point of view the moment they click this.
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    try {
      await fetch('/api/tracker/notifications/mark-read', { method: 'POST' });
    } catch {
      // Best-effort - the visible state is already correct; a failed
      // sync here just means the server catches up next page load.
    }
  }

  async function handleNotificationClick(notification: NotificationDoc) {
    if (!notification.readAt) {
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, readAt: now } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      try {
        await fetch('/api/tracker/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: notification.id }),
        });
      } catch {
        // Best-effort, same reasoning as handleMarkAllRead above.
      }
    }
    if (notification.linkTo) {
      window.location.href = notification.linkTo;
    }
  }

  // Caps the displayed number rather than ever showing something
  // absurdly wide next to the icon - "999+" still communicates "a lot"
  // exactly as well as the real, much larger number would.
  const badgeText = unreadCount > 999 ? '999+' : String(unreadCount);

  function handleToggle() {
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      // Same width the dropdown itself actually renders at - see the
      // width set on the dropdown below, kept in sync with this value.
      const dropdownWidth = Math.min(320, window.innerWidth * 0.9);
      const wouldOverflowRight = rect.left + dropdownWidth > window.innerWidth;
      setAnchorRight(wouldOverflowRight);
    }
    setOpen((o) => !o);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.35rem',
          display: 'flex',
          color: 'inherit',
        }}
      >
        <Icon name="notificationBell" size={20} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-0.15rem',
              right: '-0.15rem',
              background: 'var(--verdict-red)',
              color: '#fff',
              borderRadius: '999px',
              fontSize: '0.6rem',
              lineHeight: 1,
              padding: '0.16rem 0.32rem',
              fontWeight: 700,
              minWidth: '1.05rem',
              textAlign: 'center',
            }}
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            [anchorRight ? 'right' : 'left']: 0,
            marginTop: '0.4rem',
            width: 'min(320px, 90vw)',
            maxHeight: '400px',
            overflowY: 'auto',
            background: '#fff',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.7rem 0.9rem',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <strong style={{ fontSize: '0.85rem' }}>Notifications</strong>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                style={{ background: 'none', border: 'none', color: 'var(--amber-ink)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
              >
                Mark all read
              </button>
            )}
          </div>
          {loading ? (
            <p style={{ padding: '1rem', fontSize: '0.82rem', color: 'var(--ink-soft)' }}>Loading…</p>
          ) : notifications.length === 0 ? (
            <p style={{ padding: '1rem', fontSize: '0.82rem', color: 'var(--ink-soft)' }}>Nothing here yet.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleNotificationClick(n)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.7rem 0.9rem',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: n.readAt ? 'transparent' : 'rgba(238, 154, 46, 0.08)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '0.82rem', fontWeight: n.readAt ? 400 : 600, color: 'var(--ink)' }}>{n.title}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>{n.body}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--ink-soft)', marginTop: '0.3rem' }}>
                  {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
