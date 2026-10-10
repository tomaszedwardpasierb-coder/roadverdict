// "Continue with Google" on Android. The phone's own Google sign-in gives
// us an ID token for our web client id; the server checks it and returns
// the same session (or 2FA hand-off) an emailed code does
// (/api/auth/app/google).
//
// The native module only exists in real builds from 1.0.2 on - not in
// Expo Go, not in older builds updated over the air - so it's loaded
// lazily and the button simply doesn't appear without it. The server also
// decides whether it's switched on, by handing out the client id.
import { Platform } from 'react-native';

import { apiFetch } from '@/lib/api';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let loaded: GoogleModule | null | undefined;

function googleModule(): GoogleModule | null {
  if (loaded !== undefined) return loaded;
  try {
    loaded =require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    loaded = null;
  }
  return loaded;
}

// The client id to ask Google for, or null when the button shouldn't show.
export async function googleWebClientId(): Promise<string | null> {
  if (Platform.OS !== 'android' || !googleModule()) return null;
  const result = await apiFetch<{ webClientId: string | null }>('/api/auth/app/google');
  return result.ok ? result.data.webClientId : null;
}

export type GoogleTokenResult = { kind: 'token'; idToken: string } | { kind: 'cancelled' } | { kind: 'error'; message: string };

const GENERIC_ERROR = 'Google sign-in didn’t work. Try again, or use your email instead.';

export async function googleIdToken(webClientId: string): Promise<GoogleTokenResult> {
  const mod = googleModule();
  if (!mod) return { kind: 'error', message: GENERIC_ERROR };
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = mod;
  try {
    GoogleSignin.configure({ webClientId });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Forget the last choice, so the account picker shows every time -
    // otherwise a phone with two Google accounts can't switch.
    await GoogleSignin.signOut().catch(() => null);
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { kind: 'cancelled' };
    return response.data.idToken ? { kind: 'token', idToken: response.data.idToken } : { kind: 'error', message: GENERIC_ERROR };
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS) return { kind: 'cancelled' };
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { kind: 'error', message: 'Google sign-in needs Google Play services on this phone. Use your email instead.' };
      }
    }
    return { kind: 'error', message: GENERIC_ERROR };
  }
}
