// Place at: src/lib/playStore.ts
//
// The Android app's Google Play page, tagged with where the link sits.
// Play passes the referrer's UTM tags into Play Console's acquisition
// reports, so each placement's installs can be counted - and a placement
// that brings none can be dropped.
export const PLAY_STORE_APP_ID = "uk.co.roadverdict.app";

export type PlayStoreSource = "website" | "email" | "club";

export function playStoreUrl(source: PlayStoreSource, campaign: string): string {
  const referrer = `utm_source=${source}&utm_campaign=${campaign}`;
  return `https://play.google.com/store/apps/details?id=${PLAY_STORE_APP_ID}&referrer=${encodeURIComponent(referrer)}`;
}
