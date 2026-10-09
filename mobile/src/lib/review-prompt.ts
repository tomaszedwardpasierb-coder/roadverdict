// Asks for a store rating once, at a moment the app has clearly been useful:
// after a vehicle's MOT history has just come in, or after the person has
// logged a few things - whichever happens first. Uses the stores' own
// in-app review sheet (expo-store-review). Google and Apple decide whether
// it actually appears (both cap how often an app may show it), and it never
// appears behind a "do you like the app?" question first - Google's policy
// forbids asking anything before or alongside the review sheet.
import * as SecureStore from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';

const SAVES_KEY = 'rv-review-saves';
const ASKED_KEY = 'rv-review-asked';

// New entries (typed or scanned) to log on this phone before asking.
export const SAVES_BEFORE_ASKING = 3;

// The app's Play listing, for the "Rate RoadVerdict" card in Settings.
// Android only for now; the iPhone app isn't in the App Store yet.
const ANDROID_PACKAGE = 'uk.co.roadverdict.app';
export const PLAY_LISTING_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
export const canOpenStoreListing = Platform.OS === 'android';

// Shows the review sheet unless it's been asked for on this phone before.
async function askOnce(): Promise<void> {
  if ((await SecureStore.getItemAsync(ASKED_KEY)) || !(await StoreReview.hasAction())) return;
  await SecureStore.setItemAsync(ASKED_KEY, new Date().toISOString());
  // A moment later, so the sheet opens over the screen the person lands on
  // rather than over a form that's closing.
  setTimeout(() => {
    StoreReview.requestReview().catch(() => {});
  }, 900);
}

// Call after new entries are saved (not after edits). Never throws.
export async function noteNewEntries(count = 1): Promise<void> {
  try {
    if (count < 1 || (await SecureStore.getItemAsync(ASKED_KEY))) return;
    const saves = Number((await SecureStore.getItemAsync(SAVES_KEY)) ?? '0') + count;
    await SecureStore.setItemAsync(SAVES_KEY, String(saves));
    if (saves < SAVES_BEFORE_ASKING) return;
    await askOnce();
  } catch {
    // A rating prompt is never worth an error.
  }
}

// Call after a vehicle's MOT history import. Only an import that actually
// brought tests in counts - a vehicle with no MOT yet isn't a success
// moment. Never throws.
export async function noteMotHistoryImported(createdCount: number): Promise<void> {
  try {
    if (createdCount < 1) return;
    await askOnce();
  } catch {
    // A rating prompt is never worth an error.
  }
}

// The Settings card's button: the Play Store app if it's there, else the
// listing in the browser. Never throws.
export async function openStoreListing(): Promise<void> {
  try {
    await Linking.openURL(`market://details?id=${ANDROID_PACKAGE}`);
  } catch {
    await Linking.openURL(PLAY_LISTING_URL).catch(() => {});
  }
}
