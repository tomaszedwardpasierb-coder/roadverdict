# RoadVerdict Android app — roadmap

Same repo as the web app (`C:\dev\roadverdict-prototype`), scaffolded with
`npx create-expo-app mobile` on 2026-09-23. React Native via Expo, TypeScript.
The app talks to the existing Next.js API routes (`roadverdict.co.uk/api/**`)
over HTTPS — no backend rewrite, no shared React components with the web app
(they're web-specific). Only truly pure logic (types, calculation math,
formatters) gets extracted into a shared package later, if duplication
actually starts to hurt — not upfront.

**Explicitly out of scope for the app:** the `/tomasz` admin panel (internal
tool, not user-facing) and the marketing/guide content pages (SEO surfaces,
not something an installed app needs — the Play Store listing is the
marketing surface for an app).

**Known policy gotcha to resolve deliberately, not discover at submission
time:** Google Play requires **Google Play Billing**, not Stripe, for most
digital subscriptions purchased *inside* an Android app. Using Stripe
checkout directly in-app risks rejection/removal. Decide in Week 6 whether to
integrate Play Billing or route Pro upgrades to the website instead.

---

## Day 0 — one-time environment setup

**No USB connection to the phone available — workaround baked in below.**
The good news: Expo Go's day-to-day workflow never needs USB at all, it
works entirely over Wi-Fi. USB/ADB is only relevant later, once a custom
native module (e.g. Play Billing) forces a "development build" instead of
plain Expo Go — and even then, Android 11+ supports wireless ADB pairing as
a full USB replacement (steps below, for when Week 6+ needs it).

- [ ] Install Android Studio (bundles Android SDK, platform-tools, emulator)
- [ ] Android Studio → Device Manager → create one AVD (Pixel 7 profile, API 34 or 35) — this is the fallback device for anything that ever needs a "real" install without touching the phone at all
- [ ] Add Android SDK `platform-tools` to PATH (gives you `adb`, for later)
- [ ] On phone: install **Expo Go** from the Play Store
- [ ] Confirm phone and PC are on the same Wi-Fi network
- [ ] Day-to-day loop: run `npx expo start` on the PC, scan the QR code with the Expo Go app on the phone — no cable, no ADB, no pairing needed for this
- [ ] Not needed yet: Google Play Console account ($25 one-time) — only needed at Week 8

**Later fallback — wireless ADB pairing** (only needed once we outgrow Expo
Go's sandbox, e.g. for Play Billing in Week 6):
- [ ] On phone: Settings → About phone → tap "Build number" 7x → enables Developer Options
- [ ] On phone: Developer Options → Wireless debugging → turn on → "Pair device with pairing code"
- [ ] On PC: `adb pair <ip>:<port>` using the code shown on the phone, then `adb connect <ip>:<port>`
- [ ] This fully replaces a USB cable for installing custom development builds

## Day 1 — project scaffold

- [x] `npx create-expo-app mobile` inside `C:\dev\roadverdict-prototype\` (done 2026-09-23)
- [ ] Set up Expo Router for navigation (file-based, closest to the Next.js App Router you already know)
- [ ] Confirm the app boots in the emulator
- [ ] Confirm the app boots in Expo Go on the real phone
- [ ] Lock in: mobile app calls existing API routes directly, no shared components
- [ ] Add a typed API client wrapper (fetch + existing response shapes)
- [ ] Add `.env` config pointing at the real API base URL

## Day 2-3 — auth

- [ ] Build magic-link login screen (email input → `/api/auth/request-link`)
- [ ] **Check `src/lib/auth/session.ts` early** — web auth uses cookies; confirm whether the API needs a bearer-token/mobile-friendly session scheme, or whether cookie-jar handling in the RN HTTP client is enough
- [ ] Build "check your email" waiting screen
- [ ] Handle deep-linking so tapping the magic link on the phone opens the app, not just a browser
- [ ] Get a real signed-in session working end-to-end against the real API

## Day 4-5 — navigation shell + first real screen

- [ ] Build the persistent tab/drawer shell (equivalent of `DashboardShell.tsx`): Dashboard, Logbook, Insights, etc.
- [ ] Vehicle switcher (pull real vehicle list from the API)
- [ ] First read-only screen: dashboard stat cards, hitting the real dashboard API

## Day 6-7 — first full CRUD vertical slice (Fuel log)

- [ ] List fuel entries (car + bike) from the real API
- [ ] Add a fuel entry
- [ ] Edit a fuel entry
- [ ] Delete a fuel entry
- [ ] This becomes the template repeated for every other tracker category — worth doing carefully once

## Week 2 — remaining core tracker categories

- [ ] Day 8-9: Service history (car + bike)
- [ ] Day 10: Bills
- [ ] Day 11: Mods
- [ ] Day 12: Fines + Tolls
- [ ] Day 13-14: Labour, plus wiring charts (spend donut, mileage, fuel cost, category spend) with a mobile charting library

## Week 3 — reminders, settings, receipt scanning

- [ ] Reminders list + smart reminder logic
- [ ] Settings: units, 2FA, delete account
- [ ] Receipt scanning — **hardest port in the app**: camera permission handling, image picker, reuse (or adapt) the existing AI-parsing API endpoint for mobile photo upload. Budget real time, not a day.

## Week 4 — the three standalone tools

- [ ] Quote checker
- [ ] Cost calculator
- [ ] Buying guide (VDI/valuation) — mostly form-in/verdict-out, faster once the API-client pattern is established

## Week 5 — Vault + sharing

- [ ] Vault: encrypted document storage (camera/file-picker again)
- [ ] Share links
- [ ] Transfer ownership
- [ ] Export/share sections

## Week 6 — Pro subscription (Play Billing decision)

- [ ] Decide: integrate Google Play Billing, or route Pro upgrades to the website instead of in-app purchase
- [ ] Implement whichever path is chosen
- [ ] Verify the decision against current Play Store policy before submission (policy can change)

## Week 7 — assistant widget, push notifications, polish

- [ ] Port the assistant chat widget
- [ ] Push notifications for reminders (Expo's push notification service — genuinely new capability vs. web, web used no push)
- [ ] App icon + splash screen
- [ ] Error states, offline handling

## Week 8 — Play Console, beta, submission

- [ ] Create Google Play Console account ($25 one-time)
- [ ] Store listing: screenshots, description, privacy policy link
- [ ] Internal testing track
- [ ] Closed beta
- [ ] Submit for review
