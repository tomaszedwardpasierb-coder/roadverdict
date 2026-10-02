// App lock: when it's on, RoadVerdict asks for the phone's fingerprint,
// face or PIN before showing anything - every time the app starts, and
// after it's been away for the chosen time. Measured from leaving the
// app, so a quick trip to the camera, a share sheet or the browser never
// locks it. If the phone can't confirm the owner, the way back in is
// signing in again (email code, plus two-step sign-in if it's on).
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

export type AppLockSetting = 'off' | 'start' | '1' | '5' | '15';

// `short` is the chip text in Settings; `label` says it in full (for
// screen readers, and the line under the chips).
export const APP_LOCK_OPTIONS: { value: AppLockSetting; label: string; short: string }[] = [
  { value: 'off', label: 'Off', short: 'Off' },
  { value: 'start', label: 'Only when the app starts', short: 'On start' },
  { value: '1', label: 'After 1 minute away', short: '1 min' },
  { value: '5', label: 'After 5 minutes away', short: '5 min' },
  { value: '15', label: 'After 15 minutes away', short: '15 min' },
];

const SETTING_KEY = 'rv.appLock';
const JUST_SIGNED_IN_KEY = 'rv.appLock.justSignedIn';

// Signing in has just proved who this is (email code, plus two-step or a
// trusted phone) - so the app doesn't lock again straight after, which
// would also trap anyone who signed out because the lock wouldn't open.
export async function markJustSignedIn(): Promise<void> {
  await SecureStore.setItemAsync(JUST_SIGNED_IN_KEY, '1').catch(() => {});
}

type AppLockValue = {
  // null until the saved setting has been read - nothing is shown until then.
  locked: boolean | null;
  setting: AppLockSetting;
  unlock: () => Promise<boolean>;
  // Turning it on (or changing it) asks for the fingerprint/PIN first, so
  // nobody can lock the owner out of their own app.
  choose: (setting: AppLockSetting) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const AppLockContext = createContext<AppLockValue | null>(null);

export async function phoneHasScreenLock(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) > LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

async function confirmOwner(promptMessage: string): Promise<boolean> {
  try {
    return (await LocalAuthentication.authenticateAsync({ promptMessage, disableDeviceFallback: false })).success;
  } catch {
    return false;
  }
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [setting, setSetting] = useState<AppLockSetting>('off');
  const [locked, setLocked] = useState<boolean | null>(null);
  const leftAt = useRef<number | null>(null);
  const settingRef = useRef<AppLockSetting>('off');
  settingRef.current = setting;

  // On start: locked if the lock is on - and only if the phone can still
  // confirm the owner, so a removed screen lock never strands anyone.
  useEffect(() => {
    (async () => {
      const saved = ((await SecureStore.getItemAsync(SETTING_KEY).catch(() => null)) ?? 'off') as AppLockSetting;
      const usable = saved !== 'off' && (await phoneHasScreenLock());
      const justSignedIn = !!(await SecureStore.getItemAsync(JUST_SIGNED_IN_KEY).catch(() => null));
      if (justSignedIn) await SecureStore.deleteItemAsync(JUST_SIGNED_IN_KEY).catch(() => {});
      setSetting(usable ? saved : 'off');
      setLocked(usable && !justSignedIn);
    })();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt.current = Date.now();
        return;
      }
      if (state !== 'active' || leftAt.current === null) return;
      const away = Date.now() - leftAt.current;
      leftAt.current = null;
      const minutes = Number(settingRef.current);
      if (Number.isFinite(minutes) && away >= minutes * 60_000) setLocked(true);
    });
    return () => subscription.remove();
  }, []);

  const unlock = useCallback(async () => {
    const ok = await confirmOwner('Unlock RoadVerdict');
    if (ok) setLocked(false);
    return ok;
  }, []);

  const choose = useCallback(async (next: AppLockSetting) => {
    if (next !== 'off') {
      if (!(await phoneHasScreenLock())) {
        return { ok: false as const, error: 'Set a screen lock (fingerprint, face or PIN) in your phone’s settings first.' };
      }
      if (!(await confirmOwner('Confirm it’s you to turn on the app lock'))) {
        return { ok: false as const, error: 'Your fingerprint, face or PIN wasn’t confirmed, so nothing changed.' };
      }
    }
    await SecureStore.setItemAsync(SETTING_KEY, next).catch(() => {});
    setSetting(next);
    return { ok: true as const };
  }, []);

  const value = useMemo(() => ({ locked, setting, unlock, choose }), [locked, setting, unlock, choose]);
  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used inside AppLockProvider');
  return ctx;
}
