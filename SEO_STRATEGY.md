# RoadVerdict — SEO Handover & Strategy

**Prepared for:** the SEO agency/contractor taking on this account.
**Prepared by:** RoadVerdict (internal), 14 September 2026. **Revised 24 September 2026** after a
keyword and competitor review against the live codebase and current search results — changes
are in Sections 2, 4, 5, 6, 7, 8, 9 and 10.
**Purpose of this document:** everything a new SEO partner needs to get oriented — who we are,
who we're trying to reach, how we want to be positioned, the keywords we're targeting, and the
current technical state of the site — in one place, so work can start without a lengthy
back-and-forth first.

If anything below is unclear or you need something else to get started (analytics access,
Search Console, a call with the team), say so — this is meant to be a living brief, not a
one-way document.

---

## 1. What RoadVerdict is

RoadVerdict is a UK vehicle-ownership and quote-verification platform, live at
[roadverdict.co.uk](https://roadverdict.co.uk), covering both **motorcycles and cars** as
equally-supported vehicle types. It does two things:

- **Free tools** anyone can use without an account: a quote checker (is this repair price
  fair?), a cost calculator (what will this vehicle actually cost to run?), and a buying guide
  (enter a registration to get the vehicle's full official MOT history and a buyer checklist
  weighted by its age).
- **A free ownership tracker** ("the Tracker") where an owner logs service history, fuel, parts,
  bills, fines/tolls, and MOT data against their specific vehicle over time, then generates a
  shareable link so a buyer can see that real history when the vehicle is sold. History follows
  the *vehicle*, not the account, via an ownership-transfer feature — so a bike or car's
  documented past survives being sold, rather than resetting to nothing with every new owner.

A paid Pro tier (£5.99/month or £59/year) layers on deeper reports, an AI assistant, encrypted
document storage for official paperwork ("the Vault"), and cheaper/more frequent vehicle-history
checks. The free tools and the free tracker tier are not loss leaders for a hard paywall — they
are genuinely complete on their own, which matters for how we want to be found and talked about
(see Positioning, below).

**Company stage:** early-stage, live in production, actively shipping features. This handover
reflects the site as it exists today, not a roadmap of what's planned.

---

## 2. Positioning — how we want to be described and found

**The core thesis:** RoadVerdict is the free, UK-specific truth-teller for the three moments
right before someone spends money on a vehicle — paying a garage, buying a stranger's vehicle,
or working out if they can afford to run one at all.

**Not this:** "a maintenance-logging app that also happens to check quotes." That's how the site
currently reads technically — the homepage title and description still lead with logging (see
Section 6.1) — and it's the wrong shape entirely: it puts us in a fight for "vehicle maintenance
app," a category nobody actually searches for. **This:** a verification engine that happens to
also log — something people reach for at a specific, high-stakes decision moment, not a habit
app they have to remember to open.

Every piece of content, every landing page, and every keyword decision should trace back to one
of the four pillars below. If a proposed keyword or page doesn't map to one of these, it's
probably the wrong keyword for RoadVerdict specifically, even if it's a reasonable term for a
generic "car app." Equally, if a keyword maps to a pillar but the product can't actually answer
it (a repair job we have no price data for, a vehicle type the calculator doesn't support), it's
the wrong keyword for now — see the dropped list in Section 7.

### The four pillars

1. **The fair-price verdict** — Quote checking. The single highest-intent, money-on-the-table
   moment in the product. **For motorcycles, nobody in the UK owns this search category** —
   bike repair-cost queries return forum threads and single garages, not a dedicated tool. **For
   cars it's the opposite:** established booking platforms already rank with per-job cost
   guides and instant quotes (Section 4). So Pillar 1 leads with motorcycles; car fair-price is
   a longer game.
2. **The buyer's truth** — Buying guide & vehicle history checks. Leads with the free MOT
   history check by registration, combined with an age-weighted buyer checklist and briefing —
   a combination the many free MOT-check sites don't offer. The paid Independent Vehicle Check
   (stolen marker, write-off, outstanding finance, valuation — £9.99 bike / £13.99 car) is an
   add-on sold at the moment of purchase, not something we compete for cold "HPI check" search
   traffic with.
3. **The true cost** — Cost calculator. Captures the researcher before they've even chosen a
   vehicle — the widest, earliest part of the funnel.
4. **The dual-vehicle promise** — Motorcycles as a genuinely first-class citizen, not a
   footnote. This is real differentiation most car-only competitors structurally can't make.
   The `/motorcycles` hub now exists (Section 6.2); the bigger shift is that motorcycle
   searches are where Pillars 1 and 3 are most winnable (Section 4), so **motorcycles lead the
   content plan rather than trailing it.**

---

## 3. Audience

**Geography:** UK only, by design — the product is built around DVLA, MOT, and UK-specific
pricing data, and has no near-term plan to expand beyond that market. Every keyword and content
decision should assume a UK searcher.

**Vehicle types:** motorcycles and cars, given equal weight in the product. This is a deliberate
positioning choice (Pillar 4), not an accident of what shipped first. Content *sequencing* now
leads with motorcycles, because that's where competition is thinnest (Section 4) — the opposite
of car-first thinking with motorcycles added as an afterthought, not a retreat from cars.

**Who we're actually trying to reach, by intent rather than demographics:**

- **Owners** who've just been quoted a price for a repair or service and want to know, right
  now, whether it's fair before they agree to it.
- **Researchers** trying to work out what a vehicle actually costs to run, before or shortly
  after buying it — often comparing more than one option (e.g. a car versus a motorcycle, or
  two specific models).
- **Buyers of used vehicles** who want to check a specific vehicle's history and legitimacy
  before handing over money, as an alternative or supplement to a paid HPI-style check.
- **Sellers** who've kept good records and want a way to actually prove that to a buyer, rather
  than relying on "trust me."

We don't currently have verified demographic data (age, income, gender split) for these
segments — that's a gap worth closing early via Search Console/analytics once there's a real
query history, rather than guessing at it now. What we're confident of is the *intent* shape
above, which is a more durable basis for keyword targeting than a demographic guess would be
anyway.

---

## 4. Competitive landscape

Formal competitor/SERP research (share of voice, backlink profiles, content gap analysis) is
still outstanding. A first manual pass over live search results (24 September 2026) changes
where we expect to win:

- **Pillar 1, cars — heavily contested.** ClickMechanic
  ([per-job price estimates](https://www.clickmechanic.com/price-estimates), instant quotes by
  registration), FixMyCar/WhoCanFixMyCar (a
  [car service cost calculator](https://www.whocanfixmycar.com/car-service-cost-calculator) and
  per-job pages quoting their own booking averages) and BookMyGarage already rank for "[job]
  cost" queries, backed by real transaction data across hundreds of job types. Our car quote
  checker benchmarks five jobs. We won't out-rank them on car head terms any time soon.
- **Pillar 1, motorcycles — open.** Bike repair-cost queries (e.g. "motorcycle chain and
  sprocket replacement cost UK") return forum threads (PistonHeads, owners' club forums), Q&A
  sites and individual garages' own price pages. No dedicated tool or guide owns them. This is
  the most winnable ground on the site.
- **Pillar 2 — free MOT history is a commodity.** Many free check-by-registration sites (Total
  Car Check, Check Car Details, MOT Checkup, CarCheck and others) rank for "MOT history check",
  for bikes as well as cars. Our edge is the combination — MOT history plus an age-weighted
  buyer checklist and briefing — not the MOT data itself. Paid vehicle-history check services
  (HPI, AA, MyCarCheck, Total Car Check) compete with the paid add-on; RoadVerdict's angle there
  is a warm-moment sale (a buyer already looking at one specific vehicle's real logged history)
  rather than competing for cold "HPI check" search traffic.
- **Pillar 3 — running-cost content** is the most contested informational corner for cars, and
  genuine content depth (Section 8, Track 2) matters most there. Motorcycle running-cost results
  haven't been checked yet — worth doing first, given the Pillar 1 finding.

---

## 5. Main selling points / differentiators

- **Genuinely free, not a free trial.** Quote checker, cost calculator, buying guide (including
  the full MOT history by registration, and an estimated valuation for cars), and the full
  ownership tracker are free with no account required for the standalone tools.
- **UK-specific, not a generic international tool.** Real DVLA/MOT data lookups, UK pricing
  benchmarks, UK-specific charge types (Dartford Crossing, ULEZ, congestion charge).
- **Motorcycles and cars, equally.** Most competitors pick one vehicle type.
- **History that survives the sale.** Ownership transfer means a vehicle's documented record
  moves with it to the next owner, not just with the account that logged it.
- **Real, sourced pricing data**, not invented placeholders — though thinner than ideal. Each
  figure carries its own source and a confidence level (`src/lib/priceData.ts`,
  `src/lib/carPriceData.ts`). Of the 15 motorcycle figures (5 jobs × 3 size classes), 3 are
  "higher" confidence, 5 "medium" and 7 "lower"; of the 15 car figures, 1 is "higher", 6
  "medium" and 8 "lower". Showing that openly is itself a trust signal next to forum threads —
  but it limits how hard content can lean on any single figure.
- **Buyer safety without an account.** A buyer can view a seller's shared history and request
  takeover without ever creating a RoadVerdict account first.
- **Security-conscious for the documents that matter most.** A 2FA-gated encrypted Vault for
  official paperwork most competitors don't offer at all.

---

## 6. Current technical SEO state

Direct engineering audit of the live codebase, conducted 13–14 September 2026, findings applied
14 September 2026. Re-checked 24 September 2026 — the new **OPEN** items below come from that
pass.

### 6.1 Metadata and branding

- **FIXED** — the site-wide default title/description was motorcycle-only
  (`src/app/layout.tsx`); rewritten to vehicle-neutral framing matching the homepage.
- **FIXED** — zero Open Graph/Twitter Card metadata existed anywhere; added shared metadata plus
  dynamically generated OG images per pillar.
- **FIXED** — the quote-checker's title and H1 disagreed (title said "motorcycle," H1 didn't).
- **FIXED** — the header logo bypassed `next/image` with no explicit dimensions (CLS risk).
- **OPEN** — the homepage title ("Know What Your Vehicle Really Costs") contains no term anyone
  searches for, and its description (shared with the site-wide default in `layout.tsx`) opens
  with "Log every service, fill-up, and repair" — the logging-app framing Section 2 rejects.
  Lead with the checks instead, e.g. "Is That Garage Quote Fair? Free Motorcycle & Car Checks".
  `public/llms.txt` has the same tracker-first opening and should change with it.
- **OPEN** — leftover motorcycle-only meta descriptions: `/pro` says "multi-bike tracking"
  (`src/app/pro/page.tsx`) and `/privacy` says "free motorcycle tools"
  (`src/app/privacy/page.tsx`).

### 6.2 Site architecture

- **PASS** — canonical tags and distinct titles on every checked page.
- **FIXED** — a car hub existed (`/cars`); no motorcycle equivalent did. Built `/motorcycles` as
  a deliberate structural mirror (same design system, same section shape), and cross-linked the
  two ("Ride a motorcycle instead?" / "Drive a car instead?") so a visitor who lands on the
  wrong one has a real path to the right one, not just the homepage.
- **OPEN** — the tool pages and the new guides target the same searches (keyword
  cannibalisation). `/buying-guide` is titled "What to check before you buy a used motorcycle"
  and `/guides/buying-a-used-motorcycle` "What to Check Before Buying a Used Motorcycle"; the
  cost calculators and cost guides overlap the same way, for both vehicle kinds. The buying-guide
  titles also leave out their strongest search term — the free MOT history by registration.
  Rule going forward: **guides own the question, tool pages own the tool term.**

  | Page | Current title | Proposed title |
  |---|---|---|
  | `/buying-guide` | What to check before you buy a used motorcycle | Free Motorcycle MOT History Check & Buyer's Checklist |
  | `/cars/buying-guide` | What to check before you buy a used car | Free Car MOT History, Valuation & Buyer's Checklist |
  | `/quote-checker` | Is your motorcycle service quote fair? | Motorcycle Service & Repair Costs UK — Quote Checker |
  | `/cars/quote-checker` | Is your car service quote fair? | Car Service Costs UK — Is Your Quote Fair? |
  | `/cost-calculator` | True cost of owning your motorcycle | Motorcycle Running Cost Calculator UK |
  | `/cars/cost-calculator` | True cost of owning your car | Car Running Cost Calculator UK |

  The four guides keep their current question-style titles. Most proposed titles run past ~60
  characters once the `%s | RoadVerdict` template suffix is added — use `title: { absolute }`
  on those pages or accept Google dropping the suffix. Update each page's meta description, H1
  and OG image text to match (the quote-checker title/H1 drift fixed in 6.1 is easy to
  reintroduce). Take a Search Console baseline before retitling so the effect can be measured.

### 6.3 Structured data and indexing

- **PASS** — robots rules correctly protect private routes.
- **FIXED** — no `FAQPage` schema existed; added to the buying-guide and quote-checker pages
  (both vehicle kinds), backed by genuinely visible on-page FAQ copy, not hidden-only markup.
- **FIXED** — no `BreadcrumbList` schema existed anywhere; added across all six tool pages plus
  both vehicle hubs, via one shared builder (`src/lib/seo/breadcrumbs.ts`).
- **OPEN** — sitemap is still a hardcoded array (now with `/motorcycles` and the four guides
  added); fine today, needs revisiting once Track 1a/1b pages (Section 8) start shipping.

### 6.4 Content depth

- **PARTLY FIXED** — four long-form guides are live at `/guides` (Section 8, Track 2), each
  under 1,000 words. A real start, but still thin; the job-cost and model pages in Section 8
  are the next layer.
- **OPEN** — the tool pages only show their value after someone fills in the form, so a crawler
  sees a form, an FAQ and roughly 300 words. None of the price benchmarks appear in the static
  HTML. Render the size-class price tables — with each figure's source and confidence —
  statically on `/quote-checker` and `/cars/quote-checker`, using the same inflation-adjusted
  figures the tools use.

### 6.5 Performance

- **PASS** — fonts and hero imagery already handled correctly via `next/font` and `next/image`.

---

## 7. Keyword strategy — clusters by pillar

Exact search volumes need validating against Search Console (once there's real query history) or
a paid tool — treat every example query below as a direction, not a confirmed forecast.

| Cluster | Example queries | Intent | Priority | Owning page |
|---|---|---|---|---|
| **A — Fair price, motorcycles** (Pillars 1 + 4) | "how much is a motorbike service" · "motorcycle service cost UK" · "chain and sprocket replacement cost" · "motorcycle tyres fitted price" · "motorcycle brake pads replacement cost" | Transactional, money-moment | **Highest** | `/quote-checker` + job-cost pages (Section 8, Track 1a) |
| **A2 — Fair price, cars** (Pillar 1) | "car service cost calculator" · "interim vs full service" · "oil change cost UK" · "front brake pads replacement cost" | Transactional + research | Medium — contested (Section 4) | `/cars/quote-checker` + job-cost pages |
| **B — Buyer's truth** (Pillar 2) | "motorcycle MOT history check" · "bike check by reg" · "what to check before buying a used motorcycle" · "…used car" · "MOT history check" · "free car valuation by reg" | Research → transactional | High for bike terms; car MOT-check and valuation head terms are contested | `/buying-guide`, `/cars/buying-guide`, `/guides/buying-a-used-*` |
| **C — True cost** (Pillar 3) | "cost of running a motorcycle per year" · "125cc running costs" · "cost of running a motorbike per month" · "car running cost calculator UK" | Research, pre-purchase, top-of-funnel | High | `/cost-calculator`, `/cars/cost-calculator`, `/guides/cost-of-owning-a-*` |
| **D — Motorcycle vs car** (Pillar 4) | "is a motorcycle cheaper than a car" · "motorbike vs car commuting cost" · "motorcycle vs car cost of ownership" | Research, comparison | High | New comparison page (Track 2) |
| **E — UK charges** (Pillars 3 + 4) | "are motorcycles ULEZ exempt" · "do motorbikes pay the congestion charge" · "do motorcycles pay the Dartford crossing" | Informational | Medium | New short explainers (Track 2), linking to the cost calculator and Tracker |
| **F — Proof when selling** | "how to prove full service history" · "sell motorcycle with service records" · "digital service history" · "vehicle logbook app UK" | Research + existing-user retention | Medium | New landing page (not `/about`) |
| **G — Model MOT pages** | "Yamaha MT-07 common MOT failures" · "Honda CB500F MOT problems" · "Ford Fiesta common MOT failures" | Very specific, research → buying | **Strategic** | New — Section 8, Track 1b |
| **H — Branded** | "roadverdict" · "roadverdict reviews" · "roadverdict.co.uk" | Navigational | Maintain | Brand SERP hygiene |

**Dropped or parked** — each of these was in the 14 September version of this table, and each
promises something the product can't currently back:

| Query | Why |
|---|---|
| "cambelt replacement cost UK" · "Ford Fiesta cambelt cost" | The car quote checker has no cambelt (or clutch) data. It benchmarks five jobs: oil & filter change, interim service, full service, front brake pads, front pair of tyres. Revisit only if that data is researched. |
| "Honda CB500F service cost" · "Yamaha MT-07 running costs" · "[make model] running costs" | Prices are by size class, not by model (Section 8). Model-level pages come from MOT data instead (Cluster G). |
| "electric car running costs UK" | The car cost calculator doesn't support fully electric cars yet, and says so on the page. |
| "free HPI check alternative" · "check if car has outstanding finance" | Finance, stolen and write-off checks are the paid Independent Vehicle Check, not free — and Section 4 already rules out chasing cold HPI traffic. |
| "[make model] common problems" | Nothing backs it today. It becomes Cluster G once the MOT-data pages exist. |

---

## 8. Content strategy — the tracks

RoadVerdict holds real, sourced price data (used to power the quote checker and cost calculator)
that a typical logging-app competitor doesn't have — but less of it than the original version of
this plan assumed: five motorcycle jobs and five car jobs, each priced by size class
(small/medium/large), with a confidence level per figure. That supports a small set of honest
pages, not programmatic volume. Model-level pages need a different data source (Track 1b).

**How Track 1 changed.** It was originally scoped as make/model × job pages ("Honda CB500F
service cost"), which assumed per-model pricing data exists. It doesn't — `priceData.ts` and
`carPriceData.ts` are priced by size class, not make/model. Building per-model pages from
size-class data would mean presenting coarser data as if it were model-specific — exactly the
kind of thin, inauthentic content Google's scaled-content policy targets. That scope is
withdrawn and replaced by 1a and 1b below.

**Track 1a — job-cost pages from the price data.** One page per vehicle kind × job — ten pages:
motorcycle basic service, full service, pair of tyres, front brake pads, and chain and
sprockets; car oil & filter change, interim service, full service, front brake pads, and front
pair of tyres. Size class is the right level of detail for "[job] cost" searches, so the data
supports these honestly. Each page shows the size-class price table with the source and
confidence of each figure, what the job includes, what pushes the price up, and a link into the
quote checker. Motorcycle pages first (Section 4), starting with chain and sprockets — the only
job with "higher" confidence at every size. Get a second source for "lower" confidence figures
before they headline a page. Use the inflation-adjusted base figures, not brand/region-adjusted
ones — the brand-tier and region multipliers are unsourced placeholders (see the comments in
`priceData.ts` and `carPriceData.ts`).

**Track 1b — model pages from DVSA MOT data.** DVSA publishes anonymised MOT test results in
bulk. Aggregated by make and model, that gives genuinely model-specific content — the most
common failure and advisory items, pass rates, how those change with age — which is exactly
what the old Cluster F wanted and couldn't honestly have. Start with a pilot of 20–30 of the
most-tested UK motorcycles and cars, with a minimum sample size so thinly-tested models get no
page. Each page links to the buying guide ("check this specific vehicle's MOT history").
Before committing: confirm the dataset's licence, how current the latest release is, and that
motorcycles are covered in enough volume.

**Track 2 — a small, genuinely written guides hub. SHIPPED (2 of 4 pillars) 15 September 2026.**
Live at `/guides`: separate, genuinely-written motorcycle and car versions of "what to check
before buying a used [vehicle]" and "the real cost of owning a [vehicle] in the UK" — four real
pages, not one template with the vehicle word swapped, each with its own FAQPage and
BreadcrumbList schema, cross-linked both from the guides hub and from the relevant existing tool
page (Buying Guide ↔ its guide, Cost Calculator ↔ its guide). Next, in this order:

1. A motorcycle fair-price cornerstone ("how much should a motorcycle service cost?"), linking
   the Track 1a pages — Pillar 1's missing guide.
2. "Is a motorcycle cheaper than a car?" (Cluster D), built on both cost calculators — the
   flagship page for Pillar 4.
3. A proof-when-selling landing page (Cluster F) — the other missing pillar.
4. Short UK-charge explainers (Cluster E), each checked against TfL's and the Dartford
   Crossing's own published rules before publishing.

---

## 9. Priority order — status

**Shipped 14 September 2026 (originally split across Immediate/Near-term — all done in one pass):**
- Rewrote the default title/description in `layout.tsx` to vehicle-neutral copy
- Added Open Graph + Twitter Card metadata, with a dynamically generated OG image
  (`next/og`/`ImageResponse`) for every pillar page and both vehicle hubs (9 images total)
- Swapped the header logo to `next/image` with explicit dimensions
- Aligned the quote-checker's H1 with its own title tag
- Added `FAQPage` schema to the buying-guide and quote-checker pages (bike and car), backed by
  real visible FAQ copy on each page
- Added `BreadcrumbList` schema across all six tool pages plus both vehicle hubs
- Built `/motorcycles` as a real, structural mirror of `/cars` — closes the single biggest
  architecture gap for Pillar 4
- Cross-linked `/cars` ↔ `/motorcycles` for a visitor on the wrong one
- Added `/motorcycles` to the sitemap

**Shipped 15 September 2026:**
- Four guides at `/guides` (Track 2), cross-linked with their tool pages and added to the
  sitemap

**Next — small code changes (from the 24 September review):**
- Export a Search Console baseline (queries, impressions, clicks per page) *before* changing
  any titles
- Retitle the six tool pages per Section 6.2, with matching descriptions, H1s and OG text
- Rewrite the homepage title/description (and `llms.txt`) to lead with the checks, not logging
  (Section 6.1)
- Fix the `/pro` and `/privacy` meta descriptions (Section 6.1)
- Render the price benchmark tables statically on both quote-checker pages (Section 6.4)

**Near-term (still open):**
- Move the sitemap from a hardcoded array to one generated from a real page registry — becomes
  necessary once Track 1a/1b pages start shipping

**This quarter:**
- Track 1a: the five motorcycle job-cost pages first, starting with chain and sprockets; the
  five car pages after
- Track 1b: confirm the DVSA data's licence and currency, then the 20–30 model pilot
- Track 2: the motorcycle fair-price guide and the motorcycle-vs-car page first, then the
  proof-when-selling landing page and the UK-charge explainers
- Links: a first outreach pass to the motorcycle community — clubs, owners' forums, riding
  schools — where the free tools are directly useful. For a new domain, links are the real
  bottleneck, and the content above won't rank without some
- Consider one linkable annual asset (a "true cost of UK vehicle ownership" data report)
- Stand up rank tracking on Cluster A/B/C/D head terms, and a monthly Search Console
  query-mining pass to feed the ongoing content backlog

---

## 10. What we'll need from you, and what you'll need from us

**Access we can provide:** Google Search Console, analytics, staging/preview access.

**Boundaries worth knowing up front:**
- All copy needs to stay factually accurate to what's actually live in the product — including
  which jobs the quote checker covers and which vehicle types the calculator supports
  (Section 7's dropped list).
- Pricing used in content should be checked against the live app, not assumed stable — some
  pricing (the Buying Guide's paid report) is account-state dependent, not one flat number.
- The quote checker's price ranges are explicitly sourced-but-thin in places (Section 5) —
  worth knowing before content leans heavily on a specific figure's authority. Quote the
  inflation-adjusted base figures, not brand/region-adjusted ones.
- UK-charge content (ULEZ, congestion charge, Dartford Crossing) must be checked against the
  operators' own published rules at the time of writing.

**Open questions, not yet resolved:**
- Confirmed audience demographics once there's real analytics history.
- A proper competitor/SERP landscape analysis — a first manual pass is in Section 4; backlink
  profiles and share of voice are still outstanding.
- DVSA anonymised MOT data for Track 1b: licence, how current the latest release is, and
  motorcycle coverage.
- Budget and timeline for Track 1a, Track 1b and Track 2 content production.
- A single point of contact for content review and technical sign-off.
