import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// Which version this is, and which over-the-air update it's running (EAS
// Update downloads one in the background and applies it the next time
// the app starts), so a tester can say exactly what they're on.
export function versionLabel(): string {
  return `Version ${Constants.expoConfig?.version ?? ''}`.trim();
}

// The version plus the update it's running - shown on a long press only.
export function updateLabel(): string {
  const version = versionLabel();
  // Expo Go loads a development bundle much like an update, so it would
  // otherwise claim to be one.
  if (__DEV__ || !Updates.isEnabled) return `${version} (development)`;
  if (Updates.isEmbeddedLaunch || !Updates.createdAt) return `${version} (as installed)`;
  const at = Updates.createdAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `${version} · update of ${at}`;
}
