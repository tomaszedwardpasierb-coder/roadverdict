import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type State<T> = { data: T | null; error: string | null; loading: boolean; refreshing: boolean };

// Loads a signed-in GET endpoint, and loads it again whenever the
// screen comes back into view (so returning from "add fuel" shows the
// new entry without a manual refresh). A 401 means the session has
// ended on the server - revoked from the website, or the account was
// blocked - so the app signs out rather than showing an error forever.
export function useApi<T>(path: string | null) {
  const { token, signOut } = useAuth();
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: !!path, refreshing: false });
  const latestPath = useRef(path);
  latestPath.current = path;

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (!path) return;
      setState((s) => ({ ...s, loading: mode === 'initial' && !s.data, refreshing: mode === 'refresh', error: mode === 'silent' ? s.error : null }));
      const result = await apiFetch<T>(path, { token });
      if (latestPath.current !== path) return;
      if (!result.ok && result.status === 401) {
        await signOut();
        return;
      }
      setState((s) =>
        result.ok
          ? { data: result.data, error: null, loading: false, refreshing: false }
          : { ...s, error: result.error, loading: false, refreshing: false }
      );
    },
    [path, token, signOut]
  );

  useEffect(() => {
    setState({ data: null, error: null, loading: !!path, refreshing: false });
    load('initial');
  }, [path, load]);

  // Runs on every focus, and again whenever `load` changes while the
  // screen is in view. On the first focus, and when the path has just
  // changed, the effect above is already loading it - only a return to
  // the screen needs a reload of its own.
  const focusedPath = useRef<string | null | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      if (focusedPath.current !== path) {
        focusedPath.current = path;
        return;
      }
      load('silent');
    }, [load, path])
  );

  const refresh = useCallback(() => load('refresh'), [load]);
  const retry = useCallback(() => load('initial'), [load]);
  return { ...state, refresh, retry };
}
