# RoadVerdict Cars — Architecture Decision + Build Plan (v3)

_Supersedes `CARS_PHASE_PLAN.md` and `RoadVerdict_Car_Plan_v2.md`. This is the reference going
forward. Grounded against the live `src/` tree as of 7 September 2026._

---

## Part 1 — Architecture Decision Record

### Context

RoadVerdict is motorcycle-only today. Every doc type, price table, and category catalog in the
codebase assumes a bike. The homepage's own copy already claims otherwise (`page.tsx`'s meta
description says *"Free for motorcycles and cars"*; its JSON-LD says *"Vehicle ownership
tracker… for UK drivers and riders"*) — marketing is already ahead of the product.

One structural fact constrains every option below: `bikeId` is a foreign key referenced across
the codebase (77 files by one count, ~102 files / 65 `getPrimaryBike()` call sites by a second,
independent count — the two counts split "references the field" from "calls the lookup function"
differently; both agree it's large). All of it is live, in production, with real user data
attached. Nothing in any option on the table touches those files.

### Options considered

**B — Full unification.** Generalize to `type: "vehicle"` with a `vehicleKind` discriminator,
rename `bikeId` → `vehicleId` through every existing call site. One canonical data model.
*Rejected*: refactors everything already shipped and tested, before a single car feature exists
to show for it, in exchange for an abstraction whose correct shape isn't known yet — VED
calculation, receipt-scan fuel assumptions, and category catalogs already diverge completely
between the two vehicle kinds. This is the premature generalization this app's own conventions
already warn against elsewhere in the codebase.

**A-full — Full separation.** Sister schema at the data layer (new `Car*` doc types, zero
changes to existing bike files) *and* a fully separate authenticated product: `/cars/login`,
`/cars/dashboard`, `CarDashboardShell.tsx`, `CarSwitcher.tsx`, a second `/api/cars/assistant`
route with its own widget, tool-declarations file, and knowledge base.

- *Pros*: maximum isolation — nothing about the car experience can leak into or break the
  motorcycle one, and vice versa. Matches "sister page" read the most literally. Simplest mental
  model to reason about in isolation.
- *Cons*: doubles the ongoing maintenance surface forever — two dashboards, two AI assistants,
  two knowledge bases, two login flows — for a product whose account model is explicitly *one
  login, one session, possibly both vehicle kinds*. For a solo maintainer, that's a permanent,
  compounding cost, not a one-time one. It also doesn't actually buy immunity from the bug class
  that mattered most this session: the duplicate-title-tag bug and the assistant not knowing the
  Security tab existed were both failures of updating *shared* code when something new was added
  — and full separation still leaves real shared surface (`classifyVehicleType`, the VDG fetch,
  `verify/route.ts`'s redirect logic), so it relocates that risk rather than removing it.

**Hybrid (chosen).** Sister schema at the data layer (as A-full). Separate `/cars/*` URL
namespace for the *public, signed-out* marketing pages only. One shared, vehicle-kind-aware
authenticated dashboard and one shared, vehicle-kind-aware AI assistant.

### Decision

Hybrid, split by layer:

| Layer | Choice | Why |
|---|---|---|
| Data | Sister schema — new `Car*` doc types | Zero risk to 77+ live files; both other options agree here too |
| Public/marketing pages | Separate `/cars/` subdirectory (not a subdomain) | SEO: a subdirectory inherits the root domain's existing authority immediately; a subdomain effectively starts building authority from zero. Pure win, no real trade-off against it |
| Authenticated dashboard | Shared — one `/login`, one `/dashboard` | Account model is already "one login, one session" — a user with both a bike and a car shouldn't need two sign-ins. Reuses the existing multi-vehicle switcher pattern rather than building a second one |
| AI assistant | Shared — one `/api/assistant` route, one widget | Reuses the exact conditional-injection pattern already shipped this session (Pro-gating, dashboard-tab awareness, Security-tab awareness) for one more axis: vehicle kind. Knowledge-base *content* still splits into two Cosmos documents — only the *route* is one |

### The "professional / not a bolt-on" question, resolved

Whether the car experience *feels* first-class is a design-and-content question, not an
architecture question. A car owner never sees the Cosmos schema or the API route — they see
copy, icons, and whether anything on screen is ever motorcycle-flavored by mistake. The guard
against that is:

1. **Car-native copy everywhere**, never reused motorcycle wording with find-and-replace.
2. **Dedicated visual identity** for the car side (its own hero imagery, its own iconography) —
   compatible with shared plumbing underneath.
3. **Explicit "no vehicle-kind leakage" test coverage** (see Phase 8) — the direct, deliberate
   answer to the two real leakage-shaped bugs found this session (stale title tag, assistant
   blind to a new tab). More separation doesn't prevent this bug class; better test coverage
   does, and that's cheaper to do once, well, than to duplicate a whole second stack around.

### The one thing that would flip this decision

If the actual goal is *two brands that happen to share a backend* — a car owner should never
sense RoadVerdict was motorcycle-first — that's a legitimate reason to want full separation, and
it's a business-positioning call, not an engineering one. Confirmed not the case here: the goal
is one company, two vehicle types, one account.

### Consequences accepted

- Every shared component/route/prompt that branches on vehicle kind needs a leakage test, not
  just a happy-path test. This is a discipline requirement, not a one-time task.
- The AI assistant's system-prompt composition gains one more conditional axis (vehicle kind) on
  top of what's already there (Pro/free, dashboard tab, report-open, compare-open). Worth
  watching for this becoming unwieldy; if it does, that's a signal to revisit, not a reason not
  to start.
- The data-layer sister schema is itself a deliberate, acknowledged short-term trade-off — it may
  be worth merging into a unified model later, once real car usage shows what's actually common
  between the two. Not now, before that shape is known.

---

## Part 2 — Build plan

### Phase 2 — Data foundations — ✅ DONE, built 7 September 2026

New, additive files only, zero changes to any of the 77+ existing bike-dependent files. Verified
with a clean `tsc --noEmit`, a green full suite (2,564 tests), and a production build whose route
list is completely unchanged (confirming this phase really did land with zero user-facing
surface, as intended).

```typescript
// src/lib/tracker/car.ts
export type CarFuelType = 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'electric';
export type CarSizeClass = 'small' | 'medium' | 'large' | 'electric';

export interface CarDoc {
  id: string;
  pk: string;
  type: 'car';
  make: string;
  model: string;
  fuelType: CarFuelType;        // mandatory — determines what logging options appear
  engineLitres?: number;        // absent for electric; present for ICE/hybrid/PHEV
  batteryKwh?: number;          // absent for ICE; present for electric/PHEV
  year?: number;
  isCustomBuild?: boolean;
  currentMileage: number;
  startingMileage: number;
  nickname: string;
  region?: Region;
  annualBudget?: number;
  distanceUnit?: DistanceUnit;
  currency?: Currency;
  chartTypes?: Record<string, ChartKind>;
  originalRegistration?: string;
  registrationChanges?: RegistrationChangeEntry[];
  dvlaData?: DvlaVehicleData;   // same shape as BikeDoc — same DVLA API, imported not duplicated
  mayHavePriorHistory?: boolean;
  transferredTo?: { newCarId: string; newOwnerEmail: string; transferredAt: string };
  dateAdded: string;
}
```

**Scoped down from the original sketch, on purpose**: no `shareToken`,
`includeInsuranceInReport`/`includeFinanceInReport`, `storyCache`, or `buyerOpinionCache` — all
four belong to features (buyer report, Story So Far) that are explicit out-of-scope items for
this whole build. Carrying fields nothing writes or reads yet is exactly the premature
groundwork this app's own conventions warn against; adding them later, when those features
actually get built, is a safe, additive change. `transferredTo` stayed (car ownership transfer
also isn't built yet) purely because `isCarReadOnly`/`countActiveCars` need a real field to
check — it simply never gets set by anything today.

CRUD, all built: `createCar`, `getCarById`, `getCarsForUser`, `getPrimaryCar`, `pickActiveCar`,
`deleteCar` (cascades to all four car record types), `updateCarMileage`, `updateCarDvlaData`,
`updateCarRegion`, `updateCarBudget`, `updateCarUnits`, `updateCarCurrency`,
`addCarRegistrationChange`, `updateCarChartType`, `countActiveCars`, `generateCarId`,
`isCarReadOnly`, `getCurrentRegistration`, `findCarByRegistrationAcrossAccounts`. Unlike
`createBike`, `createCar` has no free-tier cap — no unified Pro-cap logic exists across vehicle
kinds yet; that's a business decision for a later pass, not assumed here.

```typescript
// src/lib/tracker/carClass.ts
export function getCarSizeClass(engineLitres: number | undefined, fuelType: CarFuelType): CarSizeClass {
  if (fuelType === 'electric') return 'electric';
  if (!engineLitres) return 'medium'; // safe fallback
  if (engineLitres <= 1.2) return 'small';
  if (engineLitres <= 2.0) return 'medium';
  return 'large';
}
```

Replaces `getBikeClassForCC()` for car contexts. The motorcycle function is untouched.

**One real implementation decision beyond the original sketch**: `queryTrackerDocs`
(`cosmosHelpers.ts`) hardcodes its `WHERE` clause to `c.bikeId = @bikeId` — every *other* generic
tracker helper (`createTrackerDoc`, `updateTrackerDoc`, `deleteTrackerDoc`) is already fully
generic and needed zero changes to work for car records. Rather than modify
`queryTrackerDocs` itself (touching a file every one of the 77+ bike files transitively depends
on) or store a car's id under a field literally named `bikeId` (confusing, and a real
misclassification risk later), `car.ts` gained its own small `queryCarTrackerDocs`, an exact
twin filtering on `c.carId` instead. Every car record type declares its own required
`carId: string` beyond `TrackerDocBase`, which the generic create/update/delete helpers already
handle correctly with no changes.

Four new record doc types, each mirroring its motorcycle equivalent file-for-file, each pulling
`queryCarTrackerDocs` from `car.ts` rather than `queryTrackerDocs` from `cosmosHelpers.ts`:

- **`src/lib/tracker/carServiceRecord.ts`** — `CarServiceRecordDoc { type: 'carServiceRecord', carId, jobType, cost, mileage, notes, mileageAnomaly? }`
- **`src/lib/tracker/carFuelLog.ts`** — `CarFuelLogDoc { type: 'carFuelLog', carId, fuelType, litres?, kwh?, cost, mileage, filledToFull?, mileageAnomaly? }` — `litres` for ICE/hybrid fill-ups, `kwh` for EV charging sessions
- **`src/lib/tracker/carMod.ts`** — identical shape to `ModDoc` plus `carId`, `type: 'carMod'`
- **`src/lib/tracker/carBill.ts`** — `BillDoc`'s shape minus `seriesId`/`seriesIndex`/`source` (the recurring-instalment-plan fields — `billSeries.ts` has no car equivalent yet, same "don't carry unused fields" discipline as `CarDoc` above), plus `carId`, `type: 'carBill'`

### Category catalogs — ✅ DONE

- **`src/lib/tracker/carJobTypes.ts`** — `CAR_JOB_LABELS` (oil-filter, interim-service,
  full-service, brake-pads-front/rear, brake-discs, tyres-full-set/front-pair/rear-pair/single,
  cambelt, timing-chain, clutch, battery-12v, battery-hv, aircon-regas, dpf-clean, gearbox-oil,
  coolant-flush, brake-fluid-flush, spark-plugs, air-filter, cabin-filter, wheel-alignment,
  mot-advisory, bodywork, windscreen, other) plus `CAR_JOB_REMINDER_DEFAULTS` and an initially-
  empty `CAR_BENCHMARKED_JOB_TYPES` (populated once Phase 7a price research lands — no fake
  numbers in the meantime; a test pins this array empty on purpose).
- **`src/lib/tracker/carModTypes.ts`** — `CAR_MOD_LABELS` (dash-cam, tow-bar, roof-bars,
  alloy-wheels, window-tint, seat-covers, floor-mats, boot-liner, child-seat, phone-mount,
  parking-sensors, reverse-camera, ecu-remap, exhaust, suspension, security-tracker,
  steering-wheel, custom-bespoke, other-accessory) — a different culture from motorcycle mods,
  deliberately shorter than `MOD_LABELS`' 250+ (19 keys vs. 250+, confirmed by a test).
- **`src/lib/tracker/carBillTypes.ts`** — reuses `BILL_LABELS` (insurance, road-tax, mot-test,
  finance) from `billTypes.ts` via import, not re-declaration, plus `CAR_ONLY_BILL_LABELS`
  (ulez-caz, congestion) merged into `CAR_BILL_LABELS`. `billTypes.ts` itself is not modified.
- **`src/lib/tracker/carGuessCategory.ts`** — fuzzy category guesser for car receipt items,
  parallel to `guessCategory.ts`, same word-overlap algorithm, not a modification of it.

### Car assistant knowledge base — infrastructure ✅ DONE, seed route + `/tomasz` UI deferred

`getCarAssistantConfig()` and `updateCarKnowledgeBase(content)` added to `assistantConfig.ts`,
additive, alongside a new `CarAssistantConfigDoc` type (`id: "assistantConfig-car", pk: "system"`)
and its own `CarKnowledgeBaseVersionDoc` version-history type (`type: "knowledgeBaseVersionCar"` —
deliberately distinct from the motorcycle config's `"knowledgeBaseVersion"`, so a future
version-listing/pruning function for either vehicle kind can never accidentally mix the two).

**One real difference from the motorcycle config, not just a naming twin**: `updateKnowledgeBase`
(motorcycle) throws if no config document exists yet, because it exists to update a document a
separate seed migration must create first — that migration ports over `ASSISTANT_KNOWLEDGE_BASE`,
a hardcoded constant that predates the database-backed config. There's no equivalent hardcoded
car knowledge base to migrate from, so `updateCarKnowledgeBase` upserts unconditionally instead —
the first save from the (still-to-be-built) car knowledge base editor creates the document itself,
via the exact same call every later save uses. No separate seed migration needed for cars at all.

**Deferred, deliberately, to Phase 6**: `seedCarAssistantConfig()`/a seed cron route (nothing to
seed from yet — no car knowledge base content has been written), and the `/tomasz` UI's second
`KnowledgeBaseEditor` tab (an empty editor nobody can usefully use yet isn't worth wiring before
there's real content). Both are cheap additions once Phase 6 actually authors car knowledge base
content — this doesn't block anything upstream.

**Unchanged from the original hybrid design**: no second `/api/assistant` route, no second
widget — `route.ts`'s existing `buildSystemInstruction()` will pick whichever config to load
based on the active vehicle's kind, the same way it already picks prompt blocks based on Pro
status and which dashboard tab is open.

### Vehicle-type classifier verification — ✅ DONE, verified 7 September 2026

`src/lib/tracker/vehicleTypeCheck.ts` carried its own comment admitting it had never been
verified against a live VDG response. Tested against two real, live UK registrations before any
car code was written:

| Plate | Real vehicle | Raw `DvlaBodyType` | `classifyVehicleType()` result |
|---|---|---|---|
| LA70GZF | Royal Enfield Interceptor INT 650 (motorcycle) | `"MOTORCYCLE"` | `motorcycle` ✓ |
| PA63ERB | BMW 640i M Sport Auto (car) | `"COUPE"` | `four-wheeled` ✓ |
| yc73PDO | Renault Trafic (panel van) | `"PANEL VAN"` | `four-wheeled` ✓ |
| ek58ncf | Renault Trafic (MPV-bodied) | `"MPV"` | `four-wheeled` ✓ |
| lb75hzf | Vmoto CUX (electric moped) | `"MOPED"` | `motorcycle` ✓ |
| km11chx | Honda ANF 125-A | `"MOTORCYCLE"` | `motorcycle` ✓ |

6 for 6 against real DVLA data, across a genuinely varied spread (saloon-adjacent coupe, two
different van body-type labels, a moped, and two full motorcycles) — no changes needed to
`FOUR_WHEELED_BODY_TYPE_KEYWORDS` or `MOTORCYCLE_BODY_TYPE_KEYWORDS`. The one thing gating every
later phase is now thoroughly confirmed sound. No further verification needed before Phase 2.

### Phase 3 — Receipt scanning — ✅ DONE, built 7 September 2026

Turned out substantially bigger than the plan's original one-paragraph sketch implied —
`commitReceiptItem.ts` alone is 413 lines of mileage-estimation, duplicate-detection,
plate/vehicle-mismatch and tank-plausibility logic, not just a doc-type swap. Before writing
anything, every dependency it touches (`mileageEstimate.ts`, `mileageCheck.ts`,
`duplicateCheck.ts`, `aiDescription.ts`, `tankGuess.ts`, `fuelPlausibility.ts`) was checked
against its actual type signature: all six turned out to already be vehicle-agnostic (they
operate on plain `MileagePoint`/`HistoryPoint`/number shapes, never `BikeDoc` itself), so only
the genuinely vehicle-typed pieces needed a car twin. Verified with a clean `tsc --noEmit`, a
green full suite (2,603 tests, up from Phase 2's 2,564), and a production build whose route list
is unchanged (both `commit-receipt-item(s)` routes and `scan-receipt` already existed).

```typescript
// src/lib/tracker/receiptParse.ts
export type ScanVehicle = BikeDoc | CarDoc;
export type VehicleKind = 'motorcycle' | 'car';
export function vehicleKindOf(vehicle: ScanVehicle): VehicleKind {
  return vehicle.type === 'bike' ? 'motorcycle' : 'car';
}
export async function parseReceiptFile(file: File, apiKey: string, vehicle: ScanVehicle): Promise<ParseReceiptResult>
```

**One shared prompt template, not two divergent copies.** The Gemini prompt became
`buildPrompt(vehicleKind)` — a function, not a second hardcoded string — that only parametrises
the handful of spots that are genuinely vehicle-specific (the opening noun, the service-category
examples, the fuel-type fallback reasoning). Everything else (the JSON shape, every field's
guidance, the "return your best estimate rather than omitting a field" rule) stays one string,
so the two vehicle kinds' prompts can't quietly drift apart the way two hand-maintained copies
would.

**The diesel-skip fix, exactly as scoped, plus one skip left deliberately alone.**
`fuelType === 'diesel'` now only triggers a skip when `vehicleKindOf(vehicle) === 'motorcycle'` —
diesel is normal, valid car fuel. `fuelType === 'other'` (AdBlue, screenwash — genuinely not
engine fuel) still skips for both. The unreadable-litres skip stayed **unconditional** for both
vehicle kinds, which is a real, deliberate scope cut: Gemini's extraction schema only ever
returns a litres reading, never a kWh one, so a "fuel" item on a fully electric car will always
fall out through this same skip today. Real EV-charging-receipt support (its own prompt field,
its own skip rule keyed to the car's actual `fuelType`) is additive-later work, worth doing once
there's an actual car dashboard to test it against — not before. Petrol/diesel/hybrid/PHEV car
fuel receipts are fully supported now; electric charging receipts are not yet.

**Where `vehicleKind` comes from, on each route — corrected from the v2/v3 sketch's assumption.**
`scan-receipt/route.ts` is a multipart upload endpoint, so it reads `formData.get('vehicleKind')`,
not a JSON body field. The two `commit-receipt-item(s)/route.ts` files *are* JSON endpoints, so
they read `body.vehicleKind` there instead. All three default to `'motorcycle'` when the field is
absent — the existing upload UI doesn't send it yet (that's Phase 5), so every existing call
keeps hitting the bike path byte-for-byte unchanged; this was confirmed by leaving every original
bike-path test in place with zero edits (bar one incidental fixture fix, below) and watching them
still pass.

**New file, `src/lib/tracker/commitCarReceiptItem.ts`** — `commitReceiptItem.ts`'s car twin, same
413-line shape, `commitReceiptItem.ts` itself left completely untouched (sister-schema principle
held even under real pressure to just add a union parameter to the existing function). Three
scope cuts versus the motorcycle version, all additive-later-safe:

- **No reminder auto-creation.** `commitReceiptItem.ts` imports `createReminder`; the car twin
  doesn't import it at all. Creating a reminder nobody can yet see or manage (the car reminders
  route/UI is Phase 5) would be dead weight, not a head start.
- **`tankCapacityLitres` always passed as `undefined`.** `CarDoc` carries no such field (out of
  scope per the ADR) — `guessFilledToFull`/`checkFullTankPlausibility` already handle an unset
  tank size via their own fallback heuristic, so this behaves exactly like a bike that never had
  one set. (That fallback, `DEFAULT_TANK_CAPACITY_LITRES = 16` in `tankGuess.ts`, is itself sized
  for a motorcycle tank — harmless for the "filled to full" guess specifically, since almost any
  real car fill-up clears a 16L-scaled threshold, but worth knowing if `tankGuess.ts` ever grows
  a car-specific default.)
- **A local, inline `allKnownCarPlates(car)` helper**, not a `CarDoc` overload added to
  `reportAccess.ts`'s `allKnownPlates`. Matches the standing rule this build has followed since
  Phase 2: car files never take a runtime import from a bike file, or vice versa — only pure
  `type`-only imports cross that line (here, `ReviewQueueEntry`/`PlateMismatch`/`VehicleMismatch`
  are imported as types from `commitReceiptItem.ts`, erased at compile time, so the file stays
  independent at runtime while not re-declaring a large discriminated union).

**New file, `src/lib/tracker/reestimateCarFuelMileage.ts`** — `reestimateFuelMileage.ts`'s twin,
same logic against the four `Car*` doc types. Triggered the same way: only when a receipt commit
just wrote a mileage that came directly off the receipt (a genuine new anchor), never after an
already-estimated one.

**Routing changes**, all additive branches on the existing routes rather than new files:
`scan-receipt/route.ts` and both `commit-receipt-item(s)/route.ts` files now resolve
`getPrimaryBike`/`getPrimaryCar` and call `parseReceiptFile`/`commitReceiptItem` vs
`commitCarReceiptItem` based on the resolved `vehicleKind`, with vehicle-kind-aware 404 and
skip-reason messages (e.g. *"not a valid fuel type for a car"* instead of the motorcycle
wording).

### Phase 4 — Public marketing namespace — ✅ DONE, built 7 September 2026

```
src/app/cars/
  page.tsx                    — /cars marketing landing page — ✅ DONE
  quote-checker/page.tsx      — /cars/quote-checker — deferred to Phase 7 (no car price data)
  cost-calculator/page.tsx    — /cars/cost-calculator — deferred to Phase 7
  buying-guide/page.tsx       — /cars/buying-guide — deferred to Phase 7
```

Only the landing page ships this phase — the three tool sub-pages stay deferred to Phase 7,
same reasoning as the car dashboard's hidden Reports/Quote Checker/Cost Calculator/Buying Guide
tabs: `/quote-checker`, `/cost-calculator`, and `/buying-guide` (the existing ones) are
benchmarked against motorcycle price data only (`BRAND_OPTIONS`, `getBikeClassForCC`), and a
car-facing page linking to them would overclaim. `/cars/page.tsx` deliberately never links to
them; instead it says plainly, in its own copy, that benchmarking is "next on the list."

**No hero photography.** Reuses the homepage's `rv-*` design system (dark hero, amber accent,
`rv-problems`/`rv-verdict-strip` sections) but omits the `rv-hero-panels` comic-panel grid
entirely — there's no car-specific photography to show, and reusing the motorcycle panel images
on a car page would misrepresent what they are. `.rv-hero` and `.rv-verdict-strip` both already
have their own solid-color background set in CSS, so dropping the panel markup degrades cleanly
to a clean text-led hero rather than an obviously-broken one.

Gets its own `WebApplication` JSON-LD, its own `sitemap.ts` entry (priority 0.7, between the
existing tool pages at 0.9 and `/pro` at 0.6), and a session-aware CTA: signed-out visitors go to
`/login?redirect=%2Fdashboard%3FaddVehicle%3Dcar` (reusing the same `?addVehicle=car` stand-in
`dashboard/page.tsx` already handles from Phase 5), a signed-in visitor with no car yet goes
straight to `/dashboard?addVehicle=car`, and one who already has a car goes to their existing
`/dashboard`.

**Cross-product signpost, both ways.** `AddBikeForm.tsx`'s existing four-wheeled-registration
rejection (`vehicleType === 'four-wheeled'`) now also shows a `Link` to `/cars` underneath its
error message (a new `suggestCars` state, reset alongside the other lookup state each attempt) —
this was the one thing Phase 5 explicitly left deferred, "not useful until `/cars` itself exists
to point to." The homepage gets the reverse link: a new `rv-cta-secondary` link ("Own a car
instead?") next to its existing primary CTA, using a class that already existed in `globals.css`
but was unused. `/cars` itself carries the same pattern back ("Ride a motorcycle instead?" → `/`).

**No `/cars/login`, no `/cars/dashboard`.** Signing in from the public car page uses the existing
`/login` with the existing `redirect` param (already validated by `safeRedirect.ts` — no auth
changes needed), landing back on the one `/dashboard`.

Tests: `tests/components/CarsPage.test.tsx` (new — session-aware CTA in all three states, no
links to the motorcycle-only tool pages, JSON-LD, feature cards), plus updated assertions in
`AddBikeForm.test.tsx` and `HomePage.test.tsx` for the two new cross-links, and a Playwright
smoke test in `tests/e2e/public-smoke.spec.ts`.

### Phase 5 — The shared, vehicle-kind-aware dashboard — ✅ DONE, built 7 September 2026

Landed in two slices, both now complete: the API layer + dashboard-shell infrastructure first,
then `AddCarForm`, the four car logging forms, five simplified car history/reminder components,
and actually wiring `dashboard/page.tsx` to resolve and render either vehicle kind. Verified with
a clean `tsc --noEmit`, a green full suite (2,791 tests), a green component suite (750 tests —
196 new across both slices), and a clean production build (`/dashboard`'s own bundle grew from
122 kB to 131 kB; every other route's size and the route list itself are unchanged, confirming the
existing bike path is genuinely untouched).

**Two corrections to the original sketch below, found by reading the real bike routes before
mirroring them, the same discipline used in Phase 3:**

- **No `GET` on any collection route, no `car-bill-series/*` at all.** The real bike routes
  (`services/route.ts`, `fuel/route.ts`, etc.) have no `GET` handler — record lists are read
  server-side, directly via the lib functions, inside `dashboard/page.tsx`, never through a REST
  `GET`. `bike/[bikeId]/route.ts` is `DELETE`-only too — the mileage/region/budget/etc PATCH lives
  on the collection route (`bike/route.ts`), resolving the account's primary bike implicitly, not
  on `[bikeId]`. The car routes below mirror this real convention, not the sketch's assumption.
  `car-bill-series/*` is dropped entirely — `CarBillDoc` (Phase 2) deliberately has no
  `seriesId`/`seriesIndex`/`source`, so there is nothing yet for a bill-series route to operate on.
- **`scan-receipt`, `commit-receipt-item(s)`, and `plate-lookup` are not separate car routes.**
  Phase 3 already made the three existing `/api/tracker/*` receipt-scanning routes
  vehicle-kind-aware (a `vehicleKind` field, defaulting to `"motorcycle"`), and `plate-lookup`
  turned out to have no rejection logic in the route at all — `classifyVehicleType()` just returns
  data, and `AddBikeForm.tsx` is the one that rejects `'four-wheeled'` client-side. `AddCarForm`
  will call the exact same `/api/tracker/plate-lookup`, just reacting to the result differently
  (and warning, not rejecting, on `'motorcycle'`).

**Real, built car API routes** — all under `/api/cars/`, each a deliberate mirror of its bike
equivalent (mirroring the exact validation order, mileage-consistency wiring, and response
shapes), all reusing the vehicle-agnostic `mileageCheck.ts`/`fuelPlausibility.ts` functions
already confirmed reusable in Phase 3:

```
src/app/api/cars/
  car/route.ts                 — POST (create), PATCH (mileage/region/budget/units/currency/chartType)
  car/[carId]/route.ts         — DELETE
  car-services/route.ts        — POST      car-services/[id]/route.ts  — PATCH, DELETE
  car-fuel/route.ts            — POST      car-fuel/[id]/route.ts      — PATCH, DELETE
  car-mods/route.ts            — POST      car-mods/[id]/route.ts      — PATCH, DELETE
  car-bills/route.ts           — POST      car-bills/[id]/route.ts     — PATCH, DELETE
  car-reminders/route.ts       — POST      car-reminders/[id]/route.ts — PATCH, DELETE (mark done)
  active-car/route.ts          — POST (sets activeCarId AND activeVehicleKind cookies)
  car-exists/route.ts          — GET (mirrors bike-exists, via the already-existing
                                  findCarByRegistrationAcrossAccounts)
```

**New file, `src/lib/tracker/carReminder.ts`** — a gap Phase 2 didn't cover (reminders weren't
one of its four record types, since nothing needed them until this phase's routes did). Full
sister mirror of `reminder.ts`: `CarReminderDoc { type: 'carReminder', carId, ... }`, via
`queryCarTrackerDocs` from `car.ts` rather than the bike-only `queryTrackerDocs`. `reminder.ts`
itself untouched, matching every other sister-schema decision this build has made.

**New file, `src/lib/tracker/activeVehicle.ts`** — the one genuinely new architectural piece
needed to make a *single* dashboard vehicle-kind-aware: `ACTIVE_BIKE_COOKIE` and
`ACTIVE_CAR_COOKIE` each already track "which vehicle of that kind is active", but neither can
answer "which *kind* is active right now" for an account holding both at once. A third,
neutral file (not living inside `bike.ts` or `car.ts`, to avoid exactly the cross-sister coupling
avoided everywhere else) adds `ACTIVE_VEHICLE_KIND_COOKIE` and `resolveActiveVehicle(email)`,
which both `active-bike/route.ts` and `active-car/route.ts` now set alongside their own
vehicle-id cookie. Defaults to bike when no preference is recorded yet, so every account that
predates car support lands exactly where it always has.

**`VehicleSwitcher.tsx` replaces `BikeSwitcher.tsx`.** Not a second, parallel switcher — the ADR
calls for one unified list, so this is a genuine generalization: `SwitcherVehicle { id, kind,
name, year?, currentMileage }`, switching posts to `/api/tracker/active-bike` or
`/api/cars/active-car` depending on the clicked entry's kind. For a bike-only account (every
account today) it renders byte-for-byte the same UI the original did.

**`DashboardShell.tsx` gained the minimal generalization the ADR called for**, not a duplicate
shell: `bikeName`/`bikeYear`/`bikes`/`activeBikeId` became `vehicleName`/`vehicleYear`/
`vehicles`/`activeVehicleId`, plus one new required `vehicleKind` prop. Three nav tabs — Story,
Shareable Links, Transfer ownership — depend on `BikeDoc` fields `CarDoc` deliberately doesn't
have yet (`storyCache`, a share token, transfer semantics — all explicit out-of-scope items per
the ADR), so they're hidden from both the sidebar and the mobile "More" sheet whenever
`vehicleKind === 'car'`, rather than shown broken or empty; their content props became optional
(`ReactNode | undefined`) to match. `UpdateMileageButton.tsx` gained the same `vehicleKind` prop,
PATCHing `/api/cars/car` instead of `/api/tracker/bike` when a car is active — the one existing
button wired directly into the shell (not passed as tab content) that would otherwise have
silently updated the wrong vehicle, or 404'd, for a car-active session. `RefreshVehicleDataButton`
(DVLA/MOT refresh — no car route for it yet, and MOT import is real, non-trivial extra scope) is
hidden entirely for a car-active session rather than wired to an endpoint that doesn't exist.

**`AddCarForm.tsx`** — new, parallel to `AddBikeForm.tsx`, originally simpler in three ways; two of
those three were later closed out (see "MOT import + curated car catalog, 7 September 2026"
below). One simplification remains genuinely permanent: no "request ownership" flow for an
already-tracked car (car ownership transfer isn't built — a duplicate plate on another account can
still be started fresh under the new one, just without a transfer request). Plate lookup reuses
the exact same `/api/tracker/plate-lookup` and reacts oppositely to `AddBikeForm` — rejects
`'motorcycle'` instead of `'four-wheeled'` — and makes a best-effort guess at fuel type from
DVLA's own free-text field (`mapDvlaFuelType()`), always left editable since DVLA doesn't
distinguish plain hybrid from plug-in hybrid in that field.

### MOT import + curated car catalog — ✅ DONE, built 7 September 2026

Closes the two Phase 5 scope cuts flagged above once real user feedback showed bikes actually do
pull MOT at add-time (an initial mischaracterization in conversation — corrected once
`AddBikeForm.tsx` was re-read closely: it calls `mot-history-preview` during plate lookup for the
mileage floor, then `mot-history` again right after creation, not merely from the dashboard's
"Refresh vehicle data" button).

**`src/lib/carModels.ts`** — car equivalent of `motorcycleModels.ts`: `CAR_MODELS` (426 entries,
41 UK-market brands, 2000-present mainstream nameplates, not exhaustive — same "Other / not in
this list" fallback convention) and `ALL_CAR_BRANDS`. Deliberately **no** per-entry engine-size/
fuel-type field (unlike `MotorcycleModel.engineCC`) — a single nameplate spans every fuel type and
several engine sizes over its production run, so baking in one "typical" figure would be a guessed
number wearing a confidence label, exactly what this app's conventions avoid elsewhere. Selecting
a model is purely a typing aid; `engineLitres` stays a plain user-entered field regardless of
match status, and `getCarSizeClass()` in `carClass.ts` classifies from that entered value, not
from make/model.

**`AddCarForm.tsx` now has real make/model `<select>`s** (mirroring `AddBikeForm.tsx`'s three-tier
match: full match / brand-only match with model dropped into a pre-filled custom field / no match
at all with both fields pre-filled), and real MOT integration: `applyLookupData()` calls the
already vehicle-agnostic `/api/tracker/mot-history-preview` (VRM-only, no bike-specific writes, so
reused as-is — no car-specific preview route needed) for the same mileage-floor-plus-confirmation-
checkbox UX bikes get, and a successful car creation best-effort POSTs to the new
`/api/cars/car/mot-history` route to import the full MOT history.

**New backend**: `src/lib/tracker/carMotHistoryImport.ts` (`importMotHistoryForCar`) mirrors
`motHistoryImport.ts` line-for-line in behaviour, reusing three already vehicle-agnostic
dependencies directly rather than duplicating them — `fetchMotHistoryFromVdg` (VRM-only),
`motReminderDate` (date-string-only), and `isBeforeProduction` (typed against the structural
`ProductionYearCheckable` interface, which `CarDoc` already satisfies) — and only the
bill/reminder/fuel-mileage calls are genuinely car-specific (`createCarBill`/`getCarBills`,
`createCarReminder`/`deleteCarRemindersBySourceKey`, `reestimateCarFuelMileage`, all already built
in earlier phases). `src/app/api/cars/car/mot-history/route.ts` mirrors
`/api/tracker/mot-history/route.ts`, nested under `car/` alongside `car/[carId]/route.ts` — the
same static-segment-beside-dynamic-segment pattern `bike/refresh-data/` already uses alongside
`bike/[bikeId]/`.

**Still not built**: the *ongoing* refresh flow. `RefreshVehicleDataButton` stays hidden for a
car-active dashboard — there's still no `/api/cars/car/refresh-data` route to re-pull DVLA data or
re-run MOT import after the car's already been added, only the one-time add-time pull above. A
real gap, not scheduled under any named phase.

Tests: `tests/unit/carModels.test.ts` (catalog integrity), `tests/unit/carMotHistoryImport.test.ts`
and `tests/api/car-mot-history-route.test.ts` (both mirror their motorcycle equivalents exactly),
`tests/components/AddCarForm.test.tsx` rewritten for the select-driven UX and MOT flow.

**Four new logging forms**, each simpler than its motorcycle counterpart in exactly the ways the
smaller car catalogs allow: `LogCarServiceForm.tsx`/`LogCarModForm.tsx` use plain `<select>`s over
`CAR_JOB_LABELS`/`CAR_MOD_LABELS` (28 and 19 keys — no grouping or search-autocomplete needed at
that size, unlike the motorcycle catalogs' 250+ entries). `LogCarFuelForm.tsx` branches on the
active car's own `fuelType`: litres and a "filled to full" checkbox for anything with an engine,
kWh with no such checkbox for electric — the one genuinely new field-level branch a motorcycle
form never needed. `LogCarBillForm.tsx` is one-off only, no instalment-plan path at all —
`CarBillDoc` has no `seriesId`/`seriesIndex`/`source` fields (Phase 2's own scope cut), so there's
nothing for a plan submit to attach to. All four reuse the shared, already-generic
`useTrackerFormSubmit`/`ReminderFields`/`MileageWarning`/`AttachmentUploader` components
unchanged (confirmed genuinely vehicle-agnostic before reuse) — plus one small, safe fix
`MileageWarning.tsx`'s own copy needed: a hardcoded *"your bike's current recorded..."* string,
the exact kind of leak the plan's own "no car string says bike" QA guard exists to catch.

**Five simplified car history/reminder components** — `CarServiceHistoryCard.tsx`,
`CarFuelLogCard.tsx`, `CarModCard.tsx`, `CarBillCard.tsx`, `CarReminderItem.tsx` — each a real,
working view/edit/delete card, deliberately smaller than their motorcycle equivalents
(`ServiceHistoryCard.tsx` alone is 340 lines) in two specific ways: **no price-benchmark verdict**
(no car pricing data exists yet — Phase 7's research hasn't happened, and guessing a number here
would violate the exact "no guessed numbers wearing a confidence label" discipline the benchmarked
job-type lists already enforce), and **no mileage-conflict-modal** — an edit's mileage conflict
surfaces as the server's own error message on save (the same `checkMileageConsistency` already
wired into every `/api/cars/car-*/[id]` route from Phase 5's first slice), rather than the
motorcycle cards' richer inline resolution UI. Two small new pure-logic files support them:
`carSummary.ts` (mirrors `summary.ts`'s three aggregation functions — genuinely generic at
runtime, but pinned to `BikeDoc`-derived types, so a car twin was smaller than loosening a shared
file three other things depend on) and `carReminderStatus.ts` (mirrors `reminderStatus.ts`'s
status/label functions, same "zero Cosmos dependency so a client bundle doesn't pull in the SDK"
reasoning as the original).

**`dashboard/page.tsx` now genuinely branches on vehicle kind.** At the top, `resolveActiveVehicle()`
decides which path runs; a car-active session calls a new `renderCarDashboard()` function — kept
deliberately separate from the ~700-line existing bike function rather than an inline if/else woven
through it, so the working bike path stays provably untouched (same route list, same component
behaviour, confirmed by the build). It assembles Dashboard/Service/Fuel/Parts & Accessories/
Insurance-Tax-MOT-Finance/Reminders/Privacy/Security — the eight tabs `DashboardShell`'s
`CAR_UNAVAILABLE_SECTIONS` (now also covering Reports, Quote Checker, Cost Calculator, and Buying
Guide alongside Story/Shareable Links/Transfer ownership — none of those four have car equivalents
yet either, all blocked on Phase 7's price research) actually leaves available. A fresh account
with no car yet reaches `AddCarForm` via an explicit `?addVehicle=car` query param — a deliberate,
honest stand-in for the real entry point (a `/cars` marketing page's own "get started" link, which
doesn't exist until Phase 4) rather than a fake normal-navigation path pretending Phase 4 is done.
**Cross-product signpost** (`AddBikeForm.tsx`'s four-wheeled rejection becoming a pointer to
`/cars`) stays deferred — genuinely not useful until `/cars` itself exists to point to.

### Phase 6 — The shared, vehicle-kind-aware AI assistant — ✅ DONE, built 7 September 2026

**No second route, no second widget, no `carAssistantTools.ts`.** As planned: `assistantTools.ts`
gains vehicle-kind-aware branches inside the existing tool functions rather than a parallel file.
Every session-scoped tool now resolves the account's active vehicle via `resolveActiveVehicle()`
(the same Phase 5 resolution function, not a second way of answering "which vehicle") instead of
calling `getPrimaryBike()` directly, then branches to a car-shaped or bike-shaped data fetch and
feeds both into one shared, vehicle-agnostic compute helper — `computeSpendTotal`, `computeEntries`,
`closestMileagePoint`, `computeMpgTrendResult`, `groupReminders`, `computeBudgetProgress`,
`findLastLoggedJob` — mirroring the "generic logic, vehicle-specific fetch" split `carSummary.ts`
and `carReminderStatus.ts` already established. Fully car-aware: `getSpendTotal`, `getEntries`
(including a car's litres-vs-kWh fuel description and car-only bill types like ULEZ/congestion),
`getMileage`, `getMpgTrend` (electric cars get an honest "MPG doesn't apply" rather than a fake
figure — a real kWh-per-mile equivalent would need its own outlier-detection pass, not attempted
here), `getReminders`, `getBudgetProgress`, and `getLastLoggedJob`.

**Three tools stay bike-only, each failing soft with an honest "not available for cars yet"
result** rather than guessing at a car equivalent or crashing: `getShareLinks` (no share-link
concept exists for cars), `getStorySoFar` (`CarDoc` has no `storyCache` field — the AI narrative
generator is motorcycle-written), and `proposeLogEntry` (the on-screen draft card,
`AssistantProposedEntryCard.tsx`, is itself deeply bike-shaped — grouped job/mod catalogs, a
hardcoded `/api/tracker/*` endpoint per category, no litres-vs-kWh branching — making it
vehicle-kind-aware is real, separate UI work, genuinely not attempted here so a car user never
gets a drafted entry that silently posts to the wrong endpoint). Gemini still sees one consistent
set of tool declarations regardless of which vehicle is active; the three above simply answer
honestly that they can't help yet, rather than not existing.

**`route.ts`'s `buildSystemInstruction()` now injects the right knowledge base.** A new
`activeVehicleKind` resolution (same `resolveActiveVehicle()` call, done once per request) decides
which document becomes the system prompt's opening block. A car-active session gets its own
`CarAssistantConfigDoc` content — never a fallback to the motorcycle config, even when nothing's
been saved yet or the read itself fails, since either fallback would hand motorcycle-specific
content to a car-active session, exactly the leak Phase 8's vehicle-kind-leakage tests exist to
catch; an honest `NO_CAR_KB_FALLBACK` notice covers both cases instead. Personality settings stay
shared/global, read from the motorcycle config doc regardless of active vehicle (the car config has
no personality slots — see the ADR). `logEntryAccess` gained a fourth state, `"car"`, checked
before the Pro lookup so a car-active Pro account still doesn't get the chat-logging tool attached,
with its own honest system-prompt line rather than the bike-only "upsell"/"available" copy.
`AssistantWidget.tsx` — already globally mounted — needed no changes; it doesn't need to know which
vehicle kind is active, same as it already doesn't need to know whether the account is Pro.

**`/tomasz` gets a second, clearly-labeled knowledge base editor**, per explicit request rather
than the original plan's vaguer "a second KB editor tab": `KnowledgeBaseEditor.tsx` gained four
optional props (`title`, `saveEndpoint`, `versionsEndpoint`, `confirmMessage`, all defaulting to
the original motorcycle-KB behaviour so the existing instance and its tests needed zero changes) so
one genuinely generic component serves both, rather than a duplicate file. The Assistant tab now
renders both instances back-to-back under one "Assistant configuration" heading — "🏍️ Motorcycle
knowledge base" and "🚗 Car knowledge base" — with a one-line explainer that they're fully separate
and editing one never touches the other. New `getCarKnowledgeBaseVersions`/
`pruneCarKnowledgeBaseVersions` in `assistantConfig.ts` (mirroring the motorcycle versions) back two
new routes, `/api/tomasz/assistant-config/car-knowledge-base` and its `/versions` sibling; the prune
function is wired into the existing combined `purge-stale-data` cron sweep alongside the motorcycle
one. A car KB with nothing saved yet shows "Never saved yet - the first save creates it." instead
of a garbage `Invalid Date`, a small pre-existing latent bug the empty-state case exposed and fixed
along the way (also fixed for the motorcycle editor, benefiting both).

Tests: `tests/unit/assistantTools.test.ts` rewritten to mock `resolveActiveVehicle` directly (the
one boundary every tool now actually calls) rather than `getPrimaryBike`, plus new car-active
`describe` blocks per tool; `tests/api/assistant-route.test.ts` gained a dedicated car-KB-injection
and log-entry-gating suite; `tests/unit/assistantConfig.test.ts`, `tests/api/purge-stale-data-route.test.ts`,
two new car-knowledge-base route test files, and `tests/components/KnowledgeBaseEditor.test.tsx`
all extended to cover the new car-facing surface.

### Public tools, price research, and VED (unchanged from v2)

**Price research is a content-authoring prerequisite, not a code phase.** Same discipline as the
motorcycle `BENCHMARKS` table: sourced, dated, confidence-rated, no guessed numbers. Minimum
viable set to unblock `/cars/quote-checker`:

- Oil & filter change, interim service, full service, brake pads (front), tyres (front pair) —
  each × small/medium/large × 3 regions
- MOT test — fixed by DVSA (currently £54.85 max for cars), no research needed
- Electric-specific pricing (battery service, HV battery health check) deferred — too few
  reference points for sourced data yet

**Car VED** (`src/lib/tracker/carVed.ts`) uses CO₂-emissions banding (post-April-2017 DVLA
rules), not engine-size bands like motorcycles — a genuinely different lookup table, taking
`co2Gkm` and returning first-year and standard annual rates, with an explicit caveat pointing to
GOV.UK for the exact current figure. Cars with no CO₂ figure on record show "VED varies — check
GOV.UK" rather than a wrong number.

### Tests (revised — adds the vehicle-kind-leakage category v2 didn't have)

Same rigor as the existing 2,460+ suite. Everything from v2's test table still applies
(`car.ts`, `carClass.ts`, catalog collision checks, `carGuessCategory.ts`, `receiptParse.ts`
vehicle-kind branching, `/api/cars/*` route contracts). **New, added for the hybrid architecture
specifically:**

| Area | What it must catch |
|---|---|
| Dashboard content | A car-active session never renders `JOB_LABELS`/`MOD_LABELS` (motorcycle catalogs) anywhere, and vice versa |
| Vehicle switcher | Switching from a bike to a car (and back) fully replaces every tab's content — nothing from the previous vehicle lingers |
| Assistant system prompt | The injected knowledge-base block matches the active vehicle's kind; a bike-active session is never handed car KB content and vice versa |
| Assistant tools | `getSpendTotal`/`getEntries`/etc. resolve against the correct doc types for the active vehicle; never mix bike and car records in one answer |
| Copy audit | No car-facing string contains the word "motorcycle" or "bike" (and vice versa) — the direct, mechanical guard against the bolt-on-by-reused-copy risk |

### Explicitly out of scope for this build (unchanged from v2)

- EV charging UI beyond a basic kWh + cost log (home vs. public rate distinction is a fast-follow)
- Car buyer report (`/report/[token]` is deeply motorcycle-aware; a car equivalent follows later)
- Car "Story So Far" AI narrative (`storyFacts.ts`/`storyProse.ts` are motorcycle-written)
- Car garage comparison page
- A dedicated car demo account (desirable, not a launch blocker)

---

## Summary — phases and what each ships

| Phase | What ships | Existing users affected |
|---|---|---|
| 0 | Homepage copy corrected — no longer claims car support until it's real | None |
| 1 | ✅ Done — VDG classifier verified against a real car plate and a real motorcycle plate | None |
| 2 | ✅ Done — new doc types, CRUD, job/mod/bill catalogs, car assistant config schema; 121 new unit tests, full suite green (2,564), build unchanged | None |
| 3 | ✅ Done — receipt scanner is vehicle-kind-aware; diesel not dropped for car accounts (EV/kWh receipts deferred); `commitCarReceiptItem.ts` + `reestimateCarFuelMileage.ts` new; 39 new tests, full suite green (2,603), build unchanged | Motorcycle scanning unchanged |
| 4 | ✅ Done — `/cars` marketing landing page (no tool sub-pages yet, deferred to Phase 7); cross-product signpost both ways (motorcycle plate-lookup rejection → `/cars`, homepage → `/cars`, `/cars` → homepage); own JSON-LD + sitemap entry; 9 new/changed component tests (`CarsPage.test.tsx` new) + 1 new Playwright smoke test | Motorcycle dashboard unchanged; homepage gains one new secondary CTA link |
| 5 | ✅ Done — full `/api/cars/*` route layer (14 routes); `carReminder.ts`, `activeVehicle.ts` kind-resolution, `carSummary.ts`, `carReminderStatus.ts`; `VehicleSwitcher` (replaces `BikeSwitcher`); `DashboardShell` vehicle-kind-aware; `AddCarForm` + 4 `LogCar*Form`s; 5 simplified car history/reminder cards; `dashboard/page.tsx` genuinely branches and renders a working car dashboard (Dashboard/Service/Fuel/Parts/Bills/Reminders/Privacy/Security - Reports and the 3 embedded tools deferred, no car price data yet); 196 new tests, full suite green (2,791 unit/API, 750 component) | Motorcycle dashboard unchanged (confirmed: same route list, same bundle size for every other route, same component behaviour for a bike-only account) |
| 6 | ✅ Done — one assistant, now vehicle-kind-aware; 7 of 10 tools fully car-aware (getShareLinks/getStorySoFar/proposeLogEntry stay bike-only, fail soft with an honest "not available" result); car knowledge base injected via `buildSystemInstruction()`, never falling back to the motorcycle one; `/tomasz` gets a second, clearly-labeled KB editor sharing one generic component | Motorcycle assistant behaviour unchanged when a bike is active |
| 7 | `/cars/quote-checker`, `/cars/cost-calculator`, `/cars/buying-guide`; car VED; homepage cross-link both ways | Motorcycle tools unchanged |
| 8 | Full test coverage for Phases 2–7, including vehicle-kind-leakage tests | None |
