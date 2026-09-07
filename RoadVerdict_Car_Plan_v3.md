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

### Public marketing namespace (unchanged from v2 — this is the part that was never in dispute)

```
src/app/cars/
  page.tsx                    — /cars marketing landing page (own hero imagery, own copy)
  quote-checker/page.tsx      — /cars/quote-checker
  cost-calculator/page.tsx    — /cars/cost-calculator
  buying-guide/page.tsx       — /cars/buying-guide
```

Each gets its own `WebApplication` JSON-LD, its own `sitemap.ts` entries, its own primary
keyword — same discipline the four existing motorcycle tool pages already follow, and the same
`RelatedTools`-style cross-linking pattern shipped this session extends to cross-link the two
topic clusters (motorcycle homepage → `/cars`, and back).

**No `/cars/login`, no `/cars/dashboard`.** Signing in from any public car page uses the existing
`/login` with the existing `redirect` param (already validated by `safeRedirect.ts` — no auth
changes needed), landing back on the one `/dashboard`.

### The shared, vehicle-kind-aware dashboard (replaces v2's Phase 4/5 dashboard split)

**Vehicle switcher.** The existing multi-bike switcher pattern (`BikeSwitcher.tsx`,
`pickActiveBike()`, an `activeBikeId` cookie) extends to list every vehicle on the account
regardless of kind, each tagged motorcycle or car. Switching sets which vehicle is active — the
same mechanism already in production for an account with two motorcycles, just no longer
assuming every entry is a bike.

**`dashboard/page.tsx`** gains a branch at the top: load the active vehicle, check its kind, and
fetch/assemble either the existing bike-flavoured content or the new car-flavoured content for
each tab. `DashboardShell.tsx` itself needs little to no change — it's the nav shell and mostly
vehicle-agnostic already; what changes is *what's passed into it* as each tab's content.

**Nav tabs keep their current shape** (Service, Fuel, Parts & Accessories, Insurance/Tax/MOT/
Finance, Reminders, Reports, Story, Shareable Links, Transfer Ownership, Security) — those
categories genuinely apply to both vehicle kinds. What's inside a tab is fully scoped to the
active vehicle: `CAR_JOB_LABELS` when a car is active, `JOB_LABELS` when a bike is, never merged
into one combined list.

**`AddCarForm.tsx`** — new, parallel to `AddBikeForm.tsx`. Key differences: fuel type is the
first field (it decides everything downstream); no curated model dropdown — VDG's returned
make/model strings go straight into free-text fields, since cars have too many live models to
curate the way the ~13-brand motorcycle list works; engine size in litres, or a battery-kWh field
for electric; year optional for EVs/custom builds, same logic as `isCustomBuild` today. Submits
to `POST /api/cars/car`, then redirects to the existing `/dashboard` (not a separate URL).

**Logging forms** — `LogCarServiceForm.tsx`, `LogCarFuelForm.tsx` (litres or kWh field depending
on the active car's `fuelType`; "filled to full" only shown for ICE), `LogCarModForm.tsx`,
`LogCarBillForm.tsx` (includes ULEZ/Congestion). Rendered inside the same `DashboardShell`, not a
second shell.

**Car API routes**, unchanged from v2 — all new, all under `/api/cars/` (this namespace is an
internal implementation detail, not a user-facing URL, so it doesn't conflict with the "shared
dashboard" decision):

```
src/app/api/cars/
  car/route.ts                — POST (create), GET (primary car)
  car/[carId]/route.ts        — PATCH, DELETE
  car-services/route.ts       — POST, GET          car-services/[id]/route.ts  — PATCH, DELETE
  car-fuel/route.ts           — POST, GET          car-fuel/[id]/route.ts     — PATCH, DELETE
  car-mods/route.ts           — POST, GET          car-mods/[id]/route.ts     — PATCH, DELETE
  car-bills/route.ts          — POST, GET          car-bills/[id]/route.ts    — PATCH, DELETE
  car-bill-series/route.ts    — POST, GET          car-bill-series/[id]/route.ts — PATCH, DELETE
  car-reminders/route.ts      — POST, GET          car-reminders/[id]/route.ts — PATCH, DELETE
  active-car/route.ts         — POST (set active vehicle cookie — extends the existing one)
  car-exists/route.ts         — GET (check if reg already tracked)
  scan-receipt/route.ts       — POST (sends vehicleKind: 'car' to receiptParse)
  commit-receipt-items/route.ts
  plate-lookup/route.ts       — same VDG call as /api/tracker/plate-lookup, minus the
                                 'four-wheeled' rejection — the entire reason it's a separate
                                 route rather than a shared one with a mode flag
```

**Cross-product signpost.** `AddBikeForm.tsx`'s existing rejection message for a car plate
(*"That registration belongs to a four-wheeled vehicle. We only support motorcycles here"*)
becomes a pointer instead of a dead end: *"That looks like a car — want to track it here too?"*
with a link to `/cars`, since it's the same account either way.

### The shared, vehicle-kind-aware AI assistant (replaces v2's Phase 6)

**No second route, no second widget, no `carAssistantTools.ts`.** `assistantTools.ts` gains
vehicle-kind-aware branches inside the existing tool functions (or car-specific implementations
dispatched internally) — `getSpendTotal`, `getEntries`, `proposeLogEntry`, etc. resolve against
either bike data or car data depending on the account's active vehicle, exactly the way they
already resolve "which bike" from the session rather than from anything the model supplies.
Gemini sees one consistent set of tools regardless of which vehicle is active.

`route.ts`'s `buildSystemInstruction()` gains one more conditional block, alongside the existing
Pro-gating and dashboard-tab blocks: which knowledge-base document to inject (motorcycle vs. car)
based on the active vehicle's kind. `AssistantWidget.tsx` — already globally mounted — needs no
changes; it doesn't need to know which vehicle kind is active, same as it already doesn't need to
know whether the account is Pro.

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
| 4 | `/cars/*` public marketing pages exist; cross-product signpost from motorcycle plate lookup | Motorcycle dashboard unchanged |
| 5 | Vehicle switcher extended to cars; `AddCarForm`; all car logging forms; `/api/cars/*` routes; one shared dashboard now vehicle-kind-aware | Motorcycle dashboard unchanged apart from the switcher gaining car entries |
| 6 | One assistant, now vehicle-kind-aware; second knowledge base; `/tomasz` gets a second KB editor tab | Motorcycle assistant behaviour unchanged when a bike is active |
| 7 | `/cars/quote-checker`, `/cars/cost-calculator`, `/cars/buying-guide`; car VED; homepage cross-link both ways | Motorcycle tools unchanged |
| 8 | Full test coverage for Phases 2–7, including vehicle-kind-leakage tests | None |
