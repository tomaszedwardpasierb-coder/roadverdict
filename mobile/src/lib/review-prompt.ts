// Asks for a store rating once, after the person has logged a few things -
// by then the app has clearly been useful to them. Uses the stores' own
// in-app review sheet (expo-store-review). Google and Apple decide whether
// it actually appears (both cap how often an app may show it), and it never
// appears behind a "do you like the app?" question first - Google's policy
// forbids asking anything before or alongside the review sheet.
import * as SecureStore from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';

const SAVES_KEY = 'rv-review-saves';
const ASKED_KEY = 'rv-review-asked';

// New entries (typed or scanned) to log on this phone before asking.
export const SAVES_BEFORE_ASKING = 3;

// Call after new entries are saved (not after edits). Never throws.
export async function noteNewEntries(count = 1): Promise<void> {
  try {
    if (count < 1 || (await SecureStore.getItemAsync(ASKED_KEY))) return;
    const saves = Number((await SecureStore.getItemAsync(SAVES_KEY)) ?? '0') + count;
    await SecureStore.setItemAsync(SAVES_KEY, String(saves));
    if (saves < SAVES_BEFORE_ASKING || !(await StoreReview.hasAction())) return;
    await SecureStore.setItemAsync(ASKED_KEY, new Date().toISOString());
    // A moment later, so the sheet opens over the logbook rather than over a
    // form that's closing.
    setTimeout(() => {
      StoreReview.requestReview().catch(() => {});
    }, 900);
  } catch {
    // A rating prompt is never worth an error.
  }
}
