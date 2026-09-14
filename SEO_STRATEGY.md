# RoadVerdict — SEO Handover & Strategy

**Prepared for:** the SEO agency/contractor taking on this account.
**Prepared by:** RoadVerdict (internal), 14 September 2026.
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
  (what should I check before buying this used vehicle?).
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
currently reads technically (see Section 6), and it's the wrong shape entirely — it puts us in
a fight for "vehicle maintenance app," a category nobody actually searches for. **This:** a
verification engine that happens to also log — something people reach for at a specific,
high-stakes decision moment, not a habit app they have to remember to open.

Every piece of content, every landing page, and every keyword decision should trace back to one
of the four pillars below. If a proposed keyword or page doesn't map to one of these, it's
probably the wrong keyword for RoadVerdict specifically, even if it's a reasonable term for a
generic "car app."

### The four pillars

1. **The fair-price verdict** — Quote checking. The single highest-intent, money-on-the-table
   moment in the product. Almost nobody else in the UK owns this search category with a free
   tool.
2. **The buyer's truth** — Buying guide & vehicle history checks. Competes on price against paid
   HPI-style checks, and on depth against the free-but-shallow alternatives.
3. **The true cost** — Cost calculator. Captures the researcher before they've even chosen a
   vehicle — the widest, earliest part of the funnel.
4. **The dual-vehicle promise** — Motorcycles as a genuinely first-class citizen, not a
   footnote. This is real differentiation most car-only competitors structurally can't make —
   and it's currently under-built in the site's own architecture (Section 6.2), so it needs
   deliberate attention rather than assuming it'll rank on its own.

---

## 3. Audience

**Geography:** UK only, by design — the product is built around DVLA, MOT, and UK-specific
pricing data, and has no near-term plan to expand beyond that market. Every keyword and content
decision should assume a UK searcher.

**Vehicle types:** motorcycles and cars, given equal weight. This is a deliberate positioning
choice (Pillar 4), not an accident of what shipped first — content and keyword investment
should reflect genuine parity between the two, not car-first thinking with motorcycles added
as an afterthought.

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
still outstanding — this section is directional, not settled. Paid vehicle-history check
services (HPI, AA, MyCarCheck, Total Car Check) compete with Pillar 2; RoadVerdict's angle there
is a warm-moment sale (a buyer already looking at one specific vehicle's real logged history)
rather than competing for cold "HPI check" search traffic. Generic running-cost content competes
on Pillar 3 and is the most contested corner — genuine content depth (Section 8, Track 2)
matters most there.

---

## 5. Main selling points / differentiators

- **Genuinely free, not a free trial.** Quote checker, cost calculator, buying-guide checklist,
  and the full ownership tracker are free with no account required for the standalone tools.
- **UK-specific, not a generic international tool.** Real DVLA/MOT data lookups, UK pricing
  benchmarks, UK-specific charge types (Dartford Crossing, ULEZ, congestion charge).
- **Motorcycles and cars, equally.** Most competitors pick one vehicle type.
- **History that survives the sale.** Ownership transfer means a vehicle's documented record
  moves with it to the next owner, not just with the account that logged it.
- **Real, sourced pricing data**, not invented placeholders — though thinner in places than
  ideal (see `priceData.ts`'s own sourcing notes).
- **Buyer safety without an account.** A buyer can view a seller's shared history and request
  takeover without ever creating a RoadVerdict account first.
- **Security-conscious for the documents that matter most.** A 2FA-gated encrypted Vault for
  official paperwork most competitors don't offer at all.

---

## 6. Current technical SEO state

Direct engineering audit of the live codebase, conducted 13–14 September 2026, findings applied
14 September 2026 (see Section 6.1 for what's now fixed vs. still open).

### 6.1 Metadata and branding

- **FIXED** — the site-wide default title/description was motorcycle-only
  (`src/app/layout.tsx`); rewritten to vehicle-neutral framing matching the homepage.
- **FIXED** — zero Open Graph/Twitter Card metadata existed anywhere; added shared metadata plus
  dynamically generated OG images per pillar.
- **FIXED** — the quote-checker's title and H1 disagreed (title said "motorcycle," H1 didn't).
- **FIXED** — the header logo bypassed `next/image` with no explicit dimensions (CLS risk).

### 6.2 Site architecture

- **PASS** — canonical tags and distinct titles on every checked page.
- **FIXED** — a car hub existed (`/cars`); no motorcycle equivalent did. Built `/motorcycles` as
  a deliberate structural mirror (same design system, same section shape), and cross-linked the
  two ("Ride a motorcycle instead?" / "Drive a car instead?") so a visitor who lands on the
  wrong one has a real path to the right one, not just the homepage.

### 6.3 Structured data and indexing

- **PASS** — robots rules correctly protect private routes.
- **FIXED** — no `FAQPage` schema existed; added to the buying-guide and quote-checker pages
  (both vehicle kinds), backed by genuinely visible on-page FAQ copy, not hidden-only markup.
- **FIXED** — no `BreadcrumbList` schema existed anywhere; added across all six tool pages plus
  both vehicle hubs, via one shared builder (`src/lib/seo/breadcrumbs.ts`).
- **OPEN** — sitemap is still a hardcoded array (now with `/motorcycles` added); fine today,
  needs revisiting once new pages (Track 1/2 below) start shipping in volume.

### 6.4 Content depth

- **OPEN** — no long-form content anywhere on the site. Still the single biggest gap; addressed
  by the two-track content plan in Section 8, not a code fix.

### 6.5 Performance

- **PASS** — fonts and hero imagery already handled correctly via `next/font` and `next/image`.

---

## 7. Keyword strategy — clusters by pillar

Exact search volumes need validating against Search Console (once there's real query history) or
a paid tool — treat every example query below as a direction, not a confirmed forecast.

| Cluster | Example queries | Intent | Priority | Owning page |
|---|---|---|---|---|
| **A — Fair price** (Pillar 1) | "is £300 a fair price for a motorcycle service" · "cambelt replacement cost UK" · "am I being overcharged for brake pads" · "car service cost calculator" | Transactional, money-moment | **Highest** | `/quote-checker`, `/cars/quote-checker` |
| **B — Buyer's truth** (Pillar 2) | "what to check before buying a used motorcycle" · "free HPI check alternative" · "check if car has outstanding finance" · "[make model] common problems" | Research → high-value transactional | High | `/buying-guide`, `/cars/buying-guide` |
| **C — True cost** (Pillar 3) | "cost of running a motorcycle per year" · "[make model] running costs" · "electric car running costs UK" · "motorcycle vs car cost of ownership" | Research, pre-purchase, top-of-funnel | High | `/cost-calculator`, `/cars/cost-calculator` |
| **D — Proof when selling** | "how to prove full service history" · "sell motorcycle with service records" · "vehicle logbook app UK" | Research + existing-user retention | Medium | `/about`, new landing |
| **E — Branded** | "roadverdict" · "roadverdict reviews" · "roadverdict.co.uk" | Navigational | Maintain | Brand SERP hygiene |
| **F — Long-tail model pages** | "Honda CB500F service cost" · "Yamaha MT-07 running costs" · "Ford Fiesta cambelt cost" | Very specific, low competition, converts hard | **Strategic** | New — see Section 8, Track 1 |

---

## 8. Content strategy — the two tracks

RoadVerdict already holds real, sourced, structured price and model data (used internally to
power the quote checker and cost calculator) that a typical logging-app competitor simply
doesn't have. That's raw material for programmatic pages at a volume no manual editorial process
could match — and it's exactly Cluster F above, currently worth zero organic traffic because no
page exists to catch it.

**Track 1 — programmatic pages from data already in the product.** One page template, populated
per make/model × job (or per make/model alone for a running-cost page). Highest-leverage,
lowest-editorial-cost content move available — nothing here needs to be invented, only surfaced.
Start with 20–50 genuinely good pages backed by real observations, not thousands of generic
template pages — Google's own guidance treats large volumes of low-added-value pages as scaled
content abuse.

**Track 2 — a small, genuinely written guides hub.** "What to check before buying a used
motorcycle" needs real, specific, well-sourced writing. Four to six cornerstone guides, each
mapped to one pillar, are enough to start.

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

**Near-term (still open):**
- Move the sitemap from a hardcoded array to one generated from a real page registry — worth
  doing once Track 1/2 content below starts shipping in volume, not urgent before that

**This quarter:**
- Ship Track 1: programmatic make/model × job pages from existing price data
- Ship Track 2: the first four to six cornerstone guides
- Consider one linkable annual asset (a "true cost of UK vehicle ownership" data report)
- Stand up rank tracking on Cluster A/B/C head terms, and a monthly Search Console query-mining
  pass to feed the ongoing content backlog

---

## 10. What we'll need from you, and what you'll need from us

**Access we can provide:** Google Search Console, analytics, staging/preview access.

**Boundaries worth knowing up front:**
- All copy needs to stay factually accurate to what's actually live in the product.
- Pricing used in content should be checked against the live app, not assumed stable — some
  pricing (the Buying Guide's paid report) is account-state dependent, not one flat number.
- The quote checker's price ranges are explicitly sourced-but-thin in places — worth knowing
  before content leans heavily on a specific figure's authority.

**Open questions, not yet resolved:**
- Confirmed audience demographics once there's real analytics history.
- A proper competitor/SERP landscape analysis.
- Budget and timeline for Track 1 and Track 2 content production.
- A single point of contact for content review and technical sign-off.
