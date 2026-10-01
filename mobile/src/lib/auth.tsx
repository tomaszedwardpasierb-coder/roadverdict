import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { apiFetch, emailFromToken } from '@/lib/api';
import { markJustSignedIn } from '@/lib/app-lock';
import { unregisterPush } from '@/lib/push';
import { forgetVault } from '@/lib/vault';

const TOKEN_KEY = 'rv.session';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  token: string | null;
  email: string | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let stored: string | null = null;
      try {
        stored = await SecureStore.getItemAsync(TOKEN_KEY);
      } catch {
        stored = null;
      }
      if (cancelled) return;
      if (!stored) {
        setStatus('signedOut');
        return;
      }
      // Trust the saved token straight away so the app opens instantly
      // (and still opens offline), then check it with the server. Only a
      // definite "not signed in" answer signs the person out - a network
      // failure leaves them where they are.
      setToken(stored);
      setStatus('signedIn');
      const check = await apiFetch<{ signedIn: boolean }>('/api/viewer', { token: stored });
      if (cancelled) return;
      if (check.ok && !check.data.signedIn) {
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
        setToken(null);
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (newToken: string) => {
    await markJustSignedIn();
    await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    setToken(newToken);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    const current = token;
    // The Vault locks and this account's notifications stop coming here.
    // The phone stays trusted for fingerprint/PIN, but only for this same
    // account (see trusted-device.ts) - signing back in is quick, and
    // anyone else signing in here starts from their own code.
    forgetVault();
    await unregisterPush(current).catch(() => {});
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    setToken(null);
    setStatus('signedOut');
    // Best effort - the phone forgets the token either way, and an
    // unreachable server just means the session expires on its own.
    if (current) await apiFetch('/api/auth/logout', { method: 'POST', token: current });
  }, [token]);

  const value = useMemo(
    () => ({ status, token, email: token ? emailFromToken(token) : null, signIn, signOut }),
    [status, token, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
