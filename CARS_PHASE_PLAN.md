# Bringing Cars into RoadVerdict — Phase Plan

Today, every doc type, price table, and category list in the codebase assumes a motorcycle. A car
is not a variant of a bike — it needs its own classification scheme, its own category catalogs, its
own price research, and an AI receipt prompt that no longer assumes petrol. This is the full shape
of that build, grounded in what's actually in the repo, not generic advice.

**The tension that makes this non-optional:** the homepage's own meta description already says
`"Free for motorcycles and cars"`, and its WebApplication JSON-LD says `"Vehicle ownership
tracker… for UK drivers and riders."` Marketing copy is already ahead of the product. This plan is
what closes that gap.

---

## 0. The one decision that gates everything else

Every phase below depends on this being settled first — it changes what "add a car" actually means
at the data layer.

**How does a car's data relate to a bike's?**

`bikeId` is a foreign key on 77 files across this codebase — service records, fuel logs, mods,
bills, reminders, share links, ownership transfer, the AI assistant's own tools. All of it is live,
in production, with real user data attached.

### Option A — Sister schema (recommended)

New `type: "car"` doc plus parallel `carServiceRecord` / `carFuelLog` / `carMod` / `carBill` doc
types. Nothing about the existing 77 bike files changes. One account's garage can hold both kinds
side by side, switched the same way multiple bikes already are today.

### Option B — Unified schema

Generalize to `type: "vehicle"` with a `vehicleKind` discriminator, and rename
`bikeId` → `vehicleId` through all 77 call sites. One canonical model, but a refactor of everything
already shipped and tested, before a single car feature exists to show for it.

### Why A

You don't yet know which parts of the bike/car experience genuinely want to be shared logic and
which want to diverge — VED calculation already diverges completely, receipt-scanning fuel-type
assumptions diverge, category catalogs diverge. Forcing a shared abstraction before that shape is
known is the premature generalization this app's own conventions already warn against. A can still
merge into B later, once real car usage shows what's actually common — B can't cheaply un-merge if
the shared model turns out wrong.

```
OPTION A — SISTER SCHEMA                    OPTION B — UNIFIED SCHEMA
┌─────────────┐   ┌─────────────┐           ┌───────────────────────────────────┐
│ type: "bike"│   │ type: "car" │           │ type: "vehicle"                    │
└──────┬──────┘   └──────┬──────┘           │ vehicleKind: "motorcycle" | "car"  │
       │bikeId           │carId             └──────────────────┬──────────────────┘
       ▼                 ▼                                     │ vehicleId (renamed
┌─────────────┐   ┌─────────────────┐                          │  on all 77 files)
│serviceRecord│   │carServiceRecord │                           ▼
│fuelLog      │   │carFuelLog       │              ┌─────────────────────────┐
│mod          │   │carMod           │              │ serviceRecord (shared)  │
│bill         │   │carBill          │              │ fuelLog (shared)        │
└─────────────┘   └─────────────────┘              │ mod (shared)            │
  (untouched)        (new, parallel)                │ bill (shared)           │
                                                      └─────────────────────────┘
```

---

## 1. What's already reusable

The good news first — this is a smaller lift than "support a second vehicle type" sounds like,
because most of the stack was never actually motorcycle-specific.

- **VDG plate lookup** — UK Vehicle Data Global returns whatever DVLA has for any registered VRM.
  Same endpoint, same key, no new integration. (`src/lib/tracker/dvlaDataFetch.ts`)
- **DVSA MOT history API** — identical process for cars and motorcycles, already wired up.
  (`src/lib/tracker/motHistoryFetch.ts`)
- **The vehicle-type classifier already exists** — `classifyVehicleType()` reads DVLA's body-type
  string and returns `'motorcycle' | 'four-wheeled' | 'unknown'`. Today all four call sites
  (AddBikeForm, QuoteForm, CostCalculatorForm, BuyingGuideForm) block on anything but
  `'motorcycle'`. This is the literal on/off switch for car support — and its own comment flags it
  as never verified against a real car plate lookup, so that's the first thing to test, not assume.
  (`src/lib/tracker/vehicleTypeCheck.ts`)
- **Region pricing multipliers** (London/SE, rest of England & Wales, Scotland/NI) — labour cost
  geography doesn't change by vehicle type. (`src/lib/priceData.ts`)
- **Auth, sessions, 2FA, Pro plan, the AI assistant's tool-calling architecture, the dashboard
  shell** — none of this was ever vehicle-specific. The exact conditional-gating pattern already
  built for Pro-only chat logging is the same pattern a car/motorcycle branch in the assistant's
  system prompt would use.
- **MOT test and finance bill types** — identical process and category for both vehicle kinds. Only
  road tax genuinely diverges (see below).

---

## 2. What genuinely diverges

Not relabeling — these are different rules, different data, different assumptions baked into
working code today.

| Area | Motorcycle (today) | Car (needed) |
|---|---|---|
| **Size class** (`priceData.ts`, `bike.ts`) | Single axis: `engineCC` → small/medium/large | Two axes: engine size in **litres** + **fuel type** (petrol/diesel/hybrid/PHEV/electric) — a 1.0L petrol supermini and a 2.0L diesel estate don't service the same way |
| **Road tax (VED)** (`billTypes.ts`) | Small number of flat engine-size bands | CO₂-emissions banded (post-2017 rules), plus a luxury surcharge over £40k list price — a genuinely different lookup table |
| **Fuel logging** (`scan-receipt/route.ts`) | Hardcoded: *"not petrol — motorcycles run on petrol, so this wasn't logged"* | Majority-diesel and hybrid fleet in the UK; EVs have no fuel receipt at all — need a charging-cost concept (£/kWh) instead |
| **Service categories** (`jobTypes.ts`, 17 keys) | Chain & sprockets, drive belt, valve clearance… | Cambelt/timing chain, clutch, DPF, aircon regas, 12V/HV battery… almost no overlap |
| **Mod/accessory categories** (`modTypes.ts`, 250+ keys) | Touring-gear culture: tank bags, crash bobbins, swingarm spools | Different culture entirely: alloy wheels, ECU remap, tow bar, dash cam, tint — needs its own catalog, likely much shorter |
| **Make/model intake** (`motorcycleModels.ts`, AddBikeForm) | ~13 hand-curated brands, small model lists | Thousands of live models — a curated dropdown won't scale; lean on VDG's own returned make/model instead of a maintained catalog |
| **Buying-guide checklist** (`BuyingGuideForm.tsx`) | Chain slack, fork seals, tyre wear… | Rust/corrosion, cambelt service history, cat-converter theft marks, DPF issues… |
| **Congestion / ULEZ charges** | Largely exempt in most UK schemes | A real, recurring cost most motorcycles never see — a genuine new bill category, not present at all today |

---

## 3. The build, in order

Each phase produces something that could ship on its own — nothing here needs the whole plan
finished before it's useful.

Legend: **[REUSE]** existing code, little or no change · **[NEW]** genuinely new work ·
**[SHARED]** one thing serving both vehicle kinds

### Phase 1 — Data foundations
*Nothing user-facing yet — this is what everything else is built on.*

- **[NEW]** CarDoc: `type: "car"`, make, model, **fuelType**, engine size in litres *or* battery
  kWh depending on fuel type, mileage, region, currency — mirrors BikeDoc's shape where it
  genuinely applies
- **[NEW]** carServiceRecord / carFuelLog (or carChargeLog for EVs) / carMod / carBill doc types
  and their CRUD functions, mirroring the existing bike ones file-for-file
- **[NEW]** A car size/class function — litres + fuel type → a pricing band, replacing the
  CC-based small/medium/large scheme for this vehicle kind
- **[REUSE]** Invert the four `classifyVehicleType` gates to route `'four-wheeled'` into the new
  car intake instead of blocking it — test against a real car plate first, the classifier itself
  has never been verified against a live response

### Phase 2 — Category catalogs & price research
*The single biggest content-authoring chunk of this whole phase — genuinely research work, not
just code.*

- **[NEW]** Car job/service catalog (parallel to JOB_LABELS) — sized realistically, not padded to
  match the motorcycle count
- **[NEW]** Car mod/accessory catalog (parallel to MOD_LABELS) — a different culture, likely far
  shorter than 250+ entries
- **[NEW]** Car bill types: insurance, VED (new CO₂-band calculation), congestion/ULEZ — MOT and
  finance reuse as-is
- **[NEW]** A sourced price-benchmark table per job × size/fuel band × region, with the same
  source/date/confidence discipline the existing BENCHMARKS table already holds itself to

### Phase 3 — Vehicle-aware AI
*Everything that currently assumes "the account's vehicle is a motorcycle" needs to ask first.*

- **[NEW]** Drop the hardcoded "motorcycles run on petrol" rejection in receipt scanning — read
  the actual fuel type off the receipt instead of assuming it
- **[NEW]** EV charging-cost tracking as its own concept: home charging (£/kWh estimate), public
  rapid-charging receipts — not a fuelLog variant, a genuinely different shape
- **[SHARED]** Extend the assistant's system-prompt branching (the same pattern already gating
  Pro-only chat logging) to know which vehicle kind is active and answer accordingly
- **[SHARED]** `proposeLogEntry`'s fuzzy category-matching (already built for mods) extends the
  same way to car categories — same fallback-to-"other" logic, new catalog underneath

### Phase 4 — Onboarding
*"Add your car" — the first thing a real user actually touches.*

- **[NEW]** Fuel-type selector as the first field — it determines everything that follows (litres
  vs kWh, whether a "fill-up" even makes sense)
- **[NEW]** Make/model: pull directly from the VDG plate-lookup response rather than a
  hand-curated dropdown — a manual-entry fallback still needed for a car not yet plate-looked-up
- **[SHARED]** One account, one garage, both vehicle kinds switchable the same way multiple bikes
  already are — no separate account model needed under Option A

### Phase 5 — The sister pages
*What actually makes "cars" visible — and what makes the homepage's existing claim true.*

- **[NEW]** `/cars/quote-checker`, `/cars/cost-calculator`, `/cars/buying-guide` — car-specific
  copy and checklist content, not relabeled motorcycle copy
- **[SHARED]** Same WebApplication JSON-LD pattern, sitemap entries, and the internal-linking
  approach just shipped for the motorcycle tools — a vehicle-type switcher or a clear two-family
  split, not six more disconnected pages
- **[NEW]** Until this ships, the homepage's `"Free for motorcycles and cars"` line is
  overpromising — worth a small honest caveat in the meantime rather than leaving it as-is

### Phase 6 — Testing & rollout
*The payoff of choosing Option A: this ships with zero risk to what's already live.*

- **[NEW]** Unit / API / component / integration coverage for every new car doc type and route,
  at the same rigor the existing 2,460+ test suite already holds itself to
- **[REUSE]** No migration, no feature flag, no data risk — purely additive under Option A. Ship
  "Add a car" behind a single entry point; rolling back is just not linking to it

---

## 4. Decisions that are yours, not mine

Everything above assumes reasonable defaults where I could infer one from the existing code. These
five don't have a code-derived answer.

1. **Sister schema or unified schema — confirm §0.** This is the one that has to be settled before
   any other line item starts.
2. **v1 scope: all three tools, or Quote Checker first?** Buying Guide needs the most new
   checklist-content research (rust, cambelt history, DPF); Cost Calculator needs the full
   price-benchmark table before it says anything trustworthy. Quote Checker could plausibly ship
   narrower and sooner.
3. **ICE-first, or EV/hybrid in the same release?** Electric introduces the one concept with no
   motorcycle equivalent at all — charging cost instead of fuel. Worth deciding whether that's in
   v1 or an explicit fast-follow, since it changes the fuel-type selector's shape from day one
   either way.
4. **How much car-specific price research before launch?** The existing motorcycle BENCHMARKS
   table ships with sourced, dated, confidence-rated cells — some deliberately marked "lower
   confidence, re-check first." Does car pricing need to clear the same bar before v1, or launch
   narrower with fewer job types fully sourced?
5. **What happens to the homepage's current claim in the meantime?** Leave
   `"Free for motorcycles and cars"` as-is until this ships, or soften it now so it's never
   inaccurate even for a few weeks?

---

*Grounded against the live repo at `c:\dev\roadverdict-prototype` — every file path and field name
above is real, not illustrative.*
