// Place at: src/lib/tracker/storyCooldown.ts
//
// How long a generated "Story So Far" stays before it can be regenerated -
// stories refresh once a week to keep AI use sensible. Shared by the bike
// and car story routes and the Android app's reports data, which reads a
// cached story without regenerating it.
export const STORY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
