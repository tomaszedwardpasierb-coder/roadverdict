// Place at: src/lib/seo/priceGuides.ts
//
// The price guides: one page per common job ("how much does a full service
// cost?") for cars and for motorcycles, plus the MOT. These are the pages
// SEO_STRATEGY.md's Cluster A ("fair price") points search traffic at.
//
// The rules that keep them honest - and keep them clear of Google's
// scaled-content policy:
//   - Every price comes from the same sourced benchmark tables the Quote
//     Checker uses (priceData.ts / carPriceData.ts), with the source, its
//     date and its confidence shown on the page. No number is typed into
//     this file except the MOT fee caps, which are set by law and carry
//     their GOV.UK source below.
//   - A page exists only for a job the data actually covers. Clutches,
//     cambelts, batteries and the rest get a page once they have sourced
//     rows of their own, not before.
//   - The copy is written per job, not a template with the job name
//     swapped in - what's included, what moves the price, how to check a
//     quote and what to be wary of are different for every one.
//   - Prices are the inflation-adjusted base figures only (mainstream
//     brands, outside London). The brand and region multipliers are
//     unsourced adjustments that belong in the Quote Checker's estimate for
//     one specific vehicle, not in a published table.
import {
  BIKE_CLASS_LABELS,
  getInflationAdjustedBenchmark,
  type BikeClass,
  type ConfidenceLevel,
  type JobType,
} from '@/lib/priceData';
import {
  CAR_SIZE_CLASS_LABELS,
  getInflationAdjustedCarBenchmark,
  type CarBenchmarkClass,
  type CarJobType,
} from '@/lib/carPriceData';

export type GuideVehicle = 'car' | 'motorcycle';

export interface GuideFaq {
  q: string;
  a: string;
}

interface GuideContent {
  slug: string;
  // Short name used in lists, breadcrumbs and generated sentences.
  name: string;
  // The <title> (the layout appends " | RoadVerdict") - written around the
  // words people actually search, e.g. "full car service cost".
  title: string;
  h1: string;
  description: string;
  intro: string;
  includes: string[];
  priceDrivers: string[];
  fairPriceTips: string[];
  redFlags: string[];
  faqs: GuideFaq[];
  // Other guides for the same vehicle, by slug.
  related: string[];
  // Shown on the hub card.
  summary: string;
  // Finishes "Been quoted for ...?" - e.g. "a full service", "new front
  // brake pads".
  quotedFor: string;
}

export type BenchmarkGuide =
  | (GuideContent & { kind: 'benchmark'; vehicle: 'car'; job: CarJobType })
  | (GuideContent & { kind: 'benchmark'; vehicle: 'motorcycle'; job: JobType });

export type MotGuide = GuideContent & {
  kind: 'mot';
  vehicle: GuideVehicle;
  fees: { label: string; maxFee: number }[];
  // One sentence stating the cap, built from MOT_MAX_FEE.
  feeSummary: string;
  keyFacts: string[];
};

export type PriceGuide = BenchmarkGuide | MotGuide;

// Maximum MOT fees, England, Scotland and Wales. Set by law, unchanged
// since 2010 - re-check the GOV.UK page below whenever this date is a
// year old.
export const MOT_FEE_SOURCE = {
  name: 'GOV.UK - Getting an MOT: MOT costs',
  url: 'https://www.gov.uk/getting-an-mot/mot-test-fees',
  checked: '2026-09-26',
};
export const MOT_MAX_FEE = { car: 54.85, motorcycle: 29.65, motorcycleWithSidecar: 37.8 } as const;

const MOT_KEY_FACTS_COMMON = [
  'The first MOT is due by the third anniversary of the vehicle’s registration, then every year after that.',
  'You can have the MOT up to a month (minus a day) before it runs out and keep the same renewal date.',
  'Driving without a valid MOT can mean a fine of up to £1,000 - the only exceptions are driving to a pre-booked MOT, or to a garage for repairs needed to pass.',
  'Any vehicle’s MOT history, including past failures and advisories, can be checked for free on GOV.UK.',
  'These rules and fees apply in England, Scotland and Wales. Northern Ireland has its own MOT system, run by the DVA.',
];

const CAR_GUIDES: PriceGuide[] = [
  {
    kind: 'benchmark',
    vehicle: 'car',
    job: 'full-service',
    slug: 'full-service',
    name: 'Full service',
    quotedFor: 'a full service',
    title: 'Full Car Service Cost UK: Typical Prices by Car Size',
    h1: 'How much does a full car service cost?',
    description:
      'Typical UK prices for a full car service by car size, from named sources - plus what’s included, what pushes the price up, and how to tell if your quote is fair.',
    summary: 'The annual, comprehensive service - and the one that keeps a service history “full”.',
    intro:
      'A full service is the comprehensive, usually annual service in your car’s schedule - typically every 12 months or 12,000 miles, though many modern cars use longer or variable intervals, so the schedule in your handbook or service app is what counts. It goes well beyond an oil change, and it’s the service a buyer expects to see in a “full service history”.',
    includes: [
      'Engine oil and oil filter change',
      'Air filter replacement, and usually the cabin (pollen) filter',
      'Spark plugs on petrol cars, or the fuel filter on many diesels, when your car’s schedule says they’re due',
      'Brakes checked: pads, discs, pipes and the condition of the brake fluid',
      'Steering, suspension, wheel bearings and exhaust inspected',
      'Tyres checked for tread depth, damage and pressure',
      'Lights, wipers, horn and battery tested',
      'Coolant, brake fluid, power steering fluid and screenwash checked and topped up',
    ],
    priceDrivers: [
      'Engine size and oil - bigger engines hold more oil, and many modern engines need a specific, manufacturer-approved oil that costs more.',
      'Brand - parts and labour cost more on premium makes. The table covers mainstream brands.',
      'Main dealer or independent garage - main dealers generally charge more for the same work, often considerably more.',
      'Where you live - garage labour rates are highest in London and the South East.',
      'What’s due this year - spark plugs, a fuel filter or new brake fluid can each add to a particular year’s bill.',
    ],
    fairPriceTips: [
      'Compare the checklist, not just the price - one garage’s “full service” can be another’s interim.',
      'Check the quote includes the oil and filters your car needs, and VAT.',
      'Ask the garage to call you before doing any extra work, so nothing lands on the bill without your say-so.',
      'Keep the itemised invoice. A documented full service history adds real value when you sell.',
      'If your car is under warranty, you don’t have to use the main dealer: UK competition rules let an independent garage service it, provided they follow the manufacturer’s schedule and use parts of matching quality.',
    ],
    redFlags: [
      'Extra work on the bill that you didn’t agree to beforehand.',
      'Engine flushes and fuel-system “treatments” sold as standard when they aren’t on your car’s schedule.',
      'An invoice that doesn’t list the parts and oil actually fitted.',
      'Being told something “failed” without being shown it, or given a measurement.',
    ],
    faqs: [
      {
        q: 'What’s the difference between a full and an interim service?',
        a: 'An interim service is a lighter oil-and-safety-check service for higher-mileage drivers, usually every six months or 6,000 miles, in between annual services. A full service is the annual one: it adds filter replacements and a much wider set of inspections.',
      },
      {
        q: 'How often does a car need a full service?',
        a: 'Usually every 12 months or 12,000 miles, whichever comes first - but many modern cars use longer or variable service intervals, so follow your own car’s schedule.',
      },
      {
        q: 'Do I have to use a main dealer to keep my warranty?',
        a: 'No. UK competition rules let you use an independent garage without affecting your warranty, as long as the work follows the manufacturer’s schedule and uses parts of matching quality. Keep the invoices as proof.',
      },
    ],
    related: ['interim-service', 'oil-change', 'brake-pads', 'mot'],
  },
  {
    kind: 'benchmark',
    vehicle: 'car',
    job: 'interim-service',
    slug: 'interim-service',
    name: 'Interim service',
    quotedFor: 'an interim service',
    title: 'Interim Car Service Cost UK: What It Includes and Costs',
    h1: 'How much does an interim car service cost?',
    description:
      'Typical UK prices for an interim car service by car size, what it includes, when you actually need one, and how it compares to a full service.',
    summary: 'A lighter oil-and-safety service between annual services, for higher-mileage drivers.',
    intro:
      'An interim service is a shorter service for cars that cover a lot of miles: fresh oil, a new oil filter and a set of safety checks, usually every six months or 6,000 miles in between annual full services. If you only do low miles, you may not need one at all.',
    includes: [
      'Engine oil and oil filter change',
      'Brakes, tyres, lights and wipers checked',
      'Fluid levels checked and topped up',
      'A visual check underneath for leaks, and of the exhaust and suspension',
    ],
    priceDrivers: [
      'Engine size and oil specification - the oil is the biggest part cost.',
      'Brand - premium makes cost more to service. The table covers mainstream brands.',
      'Main dealer or independent garage.',
      'Where you live - labour rates are highest in London and the South East.',
    ],
    fairPriceTips: [
      'Check whether you need one: if you do low mileage, the annual full service on its own is usually enough.',
      'An interim service doesn’t replace the annual full service - it sits in between.',
      'Compare what’s included: some garages sell an “oil change” and an “interim service” that are nearly the same job at very different prices.',
      'Ask for the oil grade your handbook specifies, and check it’s on the invoice.',
    ],
    redFlags: [
      'An interim service described or charged as a “full service”.',
      'Extra work added without your agreement.',
      'Add-on treatments sold as essential.',
    ],
    faqs: [
      {
        q: 'Do I need an interim service?',
        a: 'Only if you cover high mileage between annual services - roughly 6,000 miles or more every six months. If you drive less than that, the annual full service is usually all your car’s schedule asks for.',
      },
      {
        q: 'Does an interim service count towards service history?',
        a: 'Yes, it’s recorded as a service - but it doesn’t replace the annual full service in your car’s schedule.',
      },
    ],
    related: ['full-service', 'oil-change', 'tyres', 'mot'],
  },
  {
    kind: 'benchmark',
    vehicle: 'car',
    job: 'oil-filter',
    slug: 'oil-change',
    name: 'Oil and filter change',
    quotedFor: 'an oil and filter change',
    title: 'Car Oil Change Cost UK: Oil and Filter Change Prices',
    h1: 'How much does a car oil change cost?',
    description:
      'Typical UK prices for an oil and filter change by car size, what drives the cost, and how it compares to paying for an interim service.',
    summary: 'Old oil out, a new filter and the right grade of oil in - without a full service’s checks.',
    intro:
      'An oil and filter change is exactly that: draining the old engine oil, fitting a new oil filter and refilling with the correct grade - without the wider checks of a service. It’s the most frequent bit of maintenance a car needs, and the right oil matters more than most people realise on modern engines.',
    includes: [
      'Draining the old engine oil',
      'A new oil filter',
      'Refilling with the correct grade and quantity of oil',
      'Often, resetting the oil-service reminder on the dashboard',
    ],
    priceDrivers: [
      'Oil type - fully synthetic and manufacturer-approved oils cost noticeably more than basic grades.',
      'Oil capacity - bigger engines take more oil.',
      'Brand, and main dealer or independent garage.',
      'Where you live.',
    ],
    fairPriceTips: [
      'Check your handbook for the exact oil specification (for example a 5W-30 with a particular manufacturer approval) and ask the garage to confirm they use it.',
      'Compare with an interim service - it often costs only a little more and includes safety checks.',
      'Make sure the filter is being replaced, not just the oil topped up.',
    ],
    redFlags: [
      'A generic oil used where your engine needs a specific approved one.',
      'A “top-up” charged as a change.',
      'An oil change used as a low-price hook for expensive extra work.',
    ],
    faqs: [
      {
        q: 'How often should I change my car’s oil?',
        a: 'Follow your car’s own schedule - commonly once a year or somewhere between 6,000 and 12,000 miles, depending on the engine and oil. Some modern cars use longer, variable intervals shown on the dashboard.',
      },
      {
        q: 'Is an oil change the same as a service?',
        a: 'No. An oil change is one part of a service. A service adds safety checks, and a full service adds filter replacements and a much wider inspection.',
      },
    ],
    related: ['interim-service', 'full-service', 'brake-pads'],
  },
  {
    kind: 'benchmark',
    vehicle: 'car',
    job: 'brake-pads-front',
    slug: 'brake-pads',
    name: 'Front brake pads',
    quotedFor: 'new front brake pads',
    title: 'Brake Pad Replacement Cost UK: Front Brake Pad Prices',
    h1: 'How much does it cost to replace front brake pads?',
    description:
      'Typical UK prices for replacing front brake pads by car size, when discs need doing too, the signs your pads are worn, and how to avoid being upsold.',
    summary: 'The most common brake job - and one where it’s easy to be upsold on discs.',
    intro:
      'Front brake pads wear faster than rear ones because the front brakes do most of the stopping. Replacing them is one of the most common repair jobs a garage does - and one of the easiest to be upsold on, usually with new discs you may not need yet.',
    includes: [
      'A set of front brake pads for both front wheels',
      'Fitting, and usually cleaning and lubricating the caliper slide pins',
      'The front discs checked for thickness and damage',
      'A test drive to check the brakes',
    ],
    priceDrivers: [
      'Car size and weight - heavier cars use bigger, dearer pads.',
      'New discs - if the discs are worn out too, pads-and-discs costs far more than pads alone. The table is for pads only.',
      'Performance or premium brakes.',
      'Pad wear sensors, which some cars need replacing with the pads.',
    ],
    fairPriceTips: [
      'Ask for the disc thickness measurement. Every disc has a minimum thickness stamped on it - if yours are above it and undamaged, they don’t need replacing yet.',
      'Pads are always replaced in pairs across an axle - both front wheels together. That’s normal, not an upsell.',
      'Get the quote split into pads, discs, sensors and labour, so you can see what you’re paying for.',
    ],
    redFlags: [
      'Being told the discs need replacing without being given a measurement.',
      'A brake fluid change pushed as urgent when it isn’t due on your schedule.',
      'Being quoted for all four wheels when only the fronts are worn.',
    ],
    faqs: [
      {
        q: 'What are the signs brake pads need replacing?',
        a: 'A squeal or grinding noise when braking, a brake warning light on cars with wear sensors, longer stopping distances, or the car pulling to one side under braking. Grinding in particular needs checking straight away.',
      },
      {
        q: 'Do I need new discs as well as pads?',
        a: 'Not always. Discs only need replacing if they’re below the minimum thickness stamped on them, or they’re scored, cracked or warped. Ask for the measurement before agreeing.',
      },
      {
        q: 'How long do brake pads last?',
        a: 'It depends heavily on how and where you drive - lots of town driving wears them far faster than motorway miles. Front pads commonly last tens of thousands of miles, but there’s no fixed interval: they’re replaced when they’re worn.',
      },
    ],
    related: ['tyres', 'full-service', 'mot'],
  },
  {
    kind: 'benchmark',
    vehicle: 'car',
    job: 'tyres-front-pair',
    slug: 'tyres',
    name: 'Pair of tyres',
    quotedFor: 'a pair of tyres',
    title: 'Car Tyre Prices UK: Cost of Two Tyres Fitted',
    h1: 'How much do new car tyres cost?',
    description:
      'Typical UK prices for a pair of mid-range car tyres fitted, by car size - plus the legal tread depth, what pushes tyre prices up, and how to compare quotes.',
    summary: 'Two mid-range tyres fitted - the legal limits, and what moves the price.',
    intro:
      'Tyres are replaced in pairs on the same axle, so both sides grip the same way. These prices are for two mid-range tyres fitted - what most everyday cars run. The legal minimum tread depth for a car in the UK is 1.6mm across the central three-quarters of the tyre, all the way round, and each illegal tyre can mean a fine of up to £2,500 and three penalty points.',
    includes: [
      'Two tyres',
      'Fitting, usually with new valves',
      'Wheel balancing',
      'Disposal of the old tyres',
    ],
    priceDrivers: [
      'Tyre size - larger wheels (18 inch and up) cost considerably more than 15 or 16 inch ones.',
      'Budget, mid-range or premium brand.',
      'Run-flat, all-season or EV-specific tyres, which cost more.',
      'Speed and load rating - it must match or exceed what your car needs.',
      'Wheel alignment, which is usually extra.',
    ],
    fairPriceTips: [
      'Find your size on the tyre sidewall (for example 205/55 R16 91V) and compare “fully fitted” prices, not tyre-only prices.',
      'Mid-range tyres are a sensible balance of price, grip and wear for most everyday driving.',
      'Quick tread check: put a 20p coin in the main grooves - if you can see its outer band, get the tyres checked.',
    ],
    redFlags: [
      'Pressure to replace all four when only two are worn.',
      'Valves, balancing or disposal added at the till after a “fitted” price.',
      'A cheaper tyre with a lower speed or load rating than your car requires.',
    ],
    faqs: [
      {
        q: 'What’s the legal minimum tread depth for car tyres in the UK?',
        a: '1.6mm across the central three-quarters of the tread, around the whole tyre. Each tyre below that can mean a fine of up to £2,500 and three penalty points.',
      },
      {
        q: 'Should new tyres go on the front or the back?',
        a: 'Many tyre makers and fitters recommend putting the newer pair on the rear axle for stability, even on front-wheel-drive cars. Ask your fitter what they recommend for your car.',
      },
    ],
    related: ['brake-pads', 'full-service', 'mot'],
  },
  {
    kind: 'mot',
    vehicle: 'car',
    slug: 'mot',
    name: 'MOT',
    quotedFor: 'an MOT',
    title: 'How Much Is an MOT? Car MOT Cost UK',
    h1: 'How much does a car MOT cost?',
    description:
      'The legal maximum MOT fee for a car in the UK, when the first MOT is due, what happens if it fails, and how to avoid paying for repairs you don’t need.',
    summary: 'The price is capped by law - most garages charge less. When it’s due, and what to watch for.',
    intro:
      'An MOT is the yearly test of a car’s roadworthiness and emissions, needed once a car is three years old. The price is capped by law: a test centre can charge less than the maximum, but never more - and many charge well under it.',
    fees: [{ label: 'Car (up to 8 passenger seats)', maxFee: MOT_MAX_FEE.car }],
    feeSummary: `The maximum MOT fee for a car is ${formatPounds(MOT_MAX_FEE.car)}, set by law.`,
    keyFacts: MOT_KEY_FACTS_COMMON,
    includes: [
      'Brakes, steering, suspension and tyres',
      'Lights, mirrors, wipers, horn and seatbelts',
      'Exhaust emissions and the fuel system',
      'The body and structure, for corrosion or sharp edges',
      'The vehicle identification number and registration plates',
    ],
    priceDrivers: [
      'The test itself is capped - what varies is how much under the cap a garage charges.',
      'Repairs to pass are separate, and that’s where bills grow.',
    ],
    fairPriceTips: [
      'Shop around - independent garages and MOT-only centres often charge well under the cap.',
      'An MOT is a test, not a repair. If your car fails, you can have the repairs done somewhere else.',
      'Ask about retests before booking: a partial retest is often free if the car is repaired at the same centre and retested within 10 working days.',
      'Put the date in a reminder - RoadVerdict can remind you before it’s due.',
    ],
    redFlags: [
      'A very cheap MOT used to sell expensive repairs - get a second quote for any repair work.',
      'Repairs presented as MOT failures that aren’t on the official test result. Failures and advisories are recorded against the car and visible on GOV.UK.',
    ],
    faqs: [
      {
        q: 'When is my car’s first MOT due?',
        a: 'By the third anniversary of its registration, then every year after that. You can have it up to a month (minus a day) early and keep the same renewal date.',
      },
      {
        q: 'Can I drive my car if the MOT has run out?',
        a: 'Only to a pre-booked MOT test, or to a garage for repairs needed to pass. Otherwise you can be fined up to £1,000.',
      },
    ],
    related: ['full-service', 'brake-pads', 'tyres'],
  },
];

const MOTORCYCLE_GUIDES: PriceGuide[] = [
  {
    kind: 'benchmark',
    vehicle: 'motorcycle',
    job: 'full-service',
    slug: 'full-service',
    name: 'Full service',
    quotedFor: 'a full service',
    title: 'Motorcycle Service Cost UK: Full Service Prices',
    h1: 'How much does a full motorcycle service cost?',
    description:
      'Typical UK prices for a full motorcycle service by engine size, from named sources - what’s included, why valve checks cost so much, and how to check your quote.',
    summary: 'The major service in your bike’s schedule - and why a valve check changes everything.',
    intro:
      'A full (or major) motorcycle service is the comprehensive service in your bike’s schedule - commonly every 12 months, or at a mileage set by the manufacturer that varies a lot from bike to bike. Your handbook’s service schedule is what counts. The biggest swing in price is whether a valve clearance check is due this time.',
    includes: [
      'Engine oil and oil filter change',
      'Air filter replaced or cleaned, and spark plugs replaced when due',
      'Brakes checked - pads, discs, calipers and brake fluid (fluid replaced when due)',
      'Chain and sprockets checked for wear, adjusted and lubricated',
      'Steering head bearings, wheel bearings and suspension checked',
      'Cables, controls, lights, horn and battery checked',
      'Coolant level and condition checked on liquid-cooled bikes',
      'Valve clearances checked when your bike’s schedule says they’re due',
    ],
    priceDrivers: [
      'Engine size and number of cylinders - more cylinders mean more spark plugs and more valves to check.',
      'A valve clearance check - when one’s due, it can add hours of labour, especially on multi-cylinder engines.',
      'Fairings - fully-faired sports bikes take longer to strip down and put back together.',
      'Brand, and dealer or independent - premium European brands tend to cost more to service.',
      'Where you live - labour rates are highest in London and the South East.',
    ],
    fairPriceTips: [
      'Ask whether a valve clearance check is due on this service - it’s the single biggest difference between two quotes.',
      'Get the quote itemised: oil, filters, plugs, brake fluid and labour.',
      'Ask to be called before any extra work is done.',
      'Keep the stamped service book or invoices - service history matters a lot to motorcycle buyers.',
    ],
    redFlags: [
      '“Major service” pricing when no valve check is due, or none was actually done.',
      'Parts replaced “while it was in” that weren’t due and weren’t agreed.',
      'No itemised invoice.',
    ],
    faqs: [
      {
        q: 'How often should a motorcycle be serviced?',
        a: 'Most bikes need a service at least once a year, plus at the mileage intervals in the manufacturer’s schedule - which vary a lot between bikes. Check your handbook.',
      },
      {
        q: 'What’s the difference between a basic and a full motorcycle service?',
        a: 'A basic service is essentially an oil and filter change with safety checks. A full service adds filters, plugs, a far wider inspection and, when due, a valve clearance check.',
      },
      {
        q: 'Why does a valve clearance check cost so much?',
        a: 'Checking valve clearances means removing bodywork, often the fuel tank and the cam cover, measuring every valve and adjusting any that are out of spec. On a four-cylinder engine with 16 valves, that’s hours of skilled work.',
      },
    ],
    related: ['basic-service', 'chain-and-sprockets', 'tyres', 'mot'],
  },
  {
    kind: 'benchmark',
    vehicle: 'motorcycle',
    job: 'basic-service',
    slug: 'basic-service',
    name: 'Basic service',
    quotedFor: 'a basic service',
    title: 'Basic Motorcycle Service Cost UK: Interim Service Prices',
    h1: 'How much does a basic motorcycle service cost?',
    description:
      'Typical UK prices for a basic (interim) motorcycle service by engine size, what it covers, and when a full service is the better call.',
    summary: 'Oil, filter and the safety checks - the in-between service.',
    intro:
      'A basic (or interim) service keeps a bike healthy between major services: an oil and filter change plus the safety checks that matter on the road. It’s the service high-mileage riders do most often.',
    includes: [
      'Engine oil and oil filter change',
      'Chain adjusted and lubricated',
      'Brakes and tyres checked',
      'Lights, controls and fluid levels checked',
    ],
    priceDrivers: [
      'Engine size and how much oil it takes.',
      'Brand, and dealer or independent.',
      'Where you live.',
    ],
    fairPriceTips: [
      'Check your schedule - many riders only need one service a year, and a basic service suits bikes doing higher mileage in between.',
      'Ask exactly what’s included - some garages call an oil change a “service”.',
      'Ask for the oil grade your handbook specifies.',
    ],
    redFlags: [
      'Charged for “full” checks that weren’t done.',
      'Extras added without your agreement.',
    ],
    faqs: [
      {
        q: 'Is a basic motorcycle service worth it?',
        a: 'If you ride a lot between annual services, yes - fresh oil and a chain adjustment make a real difference to engine and drivetrain wear. If you ride little, the annual service may be all your bike needs.',
      },
    ],
    related: ['full-service', 'chain-and-sprockets', 'brake-pads'],
  },
  {
    kind: 'benchmark',
    vehicle: 'motorcycle',
    job: 'tyres-pair',
    slug: 'tyres',
    name: 'Pair of tyres',
    quotedFor: 'a pair of tyres',
    title: 'Motorcycle Tyre Prices UK: Pair Fitted by Engine Size',
    h1: 'How much do motorcycle tyres cost?',
    description:
      'Typical UK prices for a pair of motorcycle tyres fitted, by engine size - the legal tread depth for bikes, what drives the price, and how to pay less for fitting.',
    summary: 'A pair fitted - the legal limit for bikes, and how to save on fitting.',
    intro:
      'These prices are for a pair of tyres fitted, the usual benchmark - though rear tyres typically wear faster, so it’s common to replace them one at a time. For motorcycles over 50cc, the legal minimum is 1mm of tread across at least three-quarters of the tyre’s width, in a continuous band all the way round, with visible tread on the rest.',
    includes: [
      'Two tyres',
      'Fitting and balancing',
      'New valves where needed, and disposal of the old tyres',
      'Removing and refitting the wheels, if you ride the bike in',
    ],
    priceDrivers: [
      'Tyre type - sport, sport-touring, touring and adventure tyres are priced very differently.',
      'Size - wider rear tyres on bigger bikes cost more.',
      'Brand.',
      'Whether the fitter removes the wheels, or you bring them in loose.',
    ],
    fairPriceTips: [
      'Bringing the wheels in yourself (“loose wheel” fitting) is usually cheaper than having them taken off and refitted.',
      'Match the tyre to your riding - a track-focused sports tyre wears out quickly on a commuter.',
      'Check the date code on new tyres, and compare fully fitted prices.',
    ],
    redFlags: [
      'Pressure to fit a pair when only one tyre is worn.',
      'Balancing or valves charged extra without being mentioned up front.',
    ],
    faqs: [
      {
        q: 'What’s the legal minimum tread depth for a motorcycle?',
        a: 'For bikes over 50cc: 1mm across at least three-quarters of the tyre’s width, in a continuous band around the whole tyre, with visible tread on the remaining quarter.',
      },
      {
        q: 'How long do motorcycle tyres last?',
        a: 'It varies hugely with tyre type and riding style - soft sports tyres can be worn out in a few thousand miles, while touring tyres usually last much longer. Rear tyres generally wear faster than fronts.',
      },
    ],
    related: ['brake-pads', 'chain-and-sprockets', 'mot'],
  },
  {
    kind: 'benchmark',
    vehicle: 'motorcycle',
    job: 'brake-pads-front',
    slug: 'brake-pads',
    name: 'Front brake pads',
    quotedFor: 'new front brake pads',
    title: 'Motorcycle Brake Pad Replacement Cost UK: Front Pads',
    h1: 'How much does it cost to replace motorcycle brake pads?',
    description:
      'Typical UK prices for replacing a motorcycle’s front brake pads by engine size, twin-disc bikes, pad types, and the signs your pads are worn.',
    summary: 'Front pads - twin discs, pad types and when they’re due.',
    intro:
      'The front brake does most of a motorcycle’s stopping, so front pads wear fastest. Many bigger bikes have twin front discs, which means two calipers and two sets of pads - one reason the price climbs with engine size.',
    includes: [
      'Front brake pads fitted - both calipers on twin-disc bikes',
      'Calipers cleaned and pistons checked',
      'Discs checked for thickness and warping',
      'Brake fluid level checked, and a test ride',
    ],
    priceDrivers: [
      'Single or twin front discs.',
      'Pad type - sintered and organic pads are priced differently.',
      'Brand.',
      'Caliper condition - seized pistons or worn seals add cost.',
    ],
    fairPriceTips: [
      'Ask for the pad and disc measurements - discs have a minimum thickness stamped on them.',
      'Check which pad type your bike’s brakes are designed for, and ask what’s being fitted.',
      'Get the quote split into pads and labour.',
    ],
    redFlags: [
      'A full brake “overhaul” quoted when only the pads are worn.',
      'Discs replaced without a measurement.',
    ],
    faqs: [
      {
        q: 'How do I know when my motorcycle brake pads need replacing?',
        a: 'Most pads have a wear groove or indicator - once the friction material is down to around 1-2mm, or the groove has gone, they need replacing. Squealing, grinding or a spongy lever need checking straight away.',
      },
    ],
    related: ['tyres', 'full-service', 'mot'],
  },
  {
    kind: 'benchmark',
    vehicle: 'motorcycle',
    job: 'chain-and-sprockets',
    slug: 'chain-and-sprockets',
    name: 'Chain and sprockets',
    quotedFor: 'a chain and sprocket kit',
    title: 'Motorcycle Chain and Sprocket Kit Cost UK: Fitted Prices',
    h1: 'How much does a motorcycle chain and sprocket kit cost?',
    description:
      'Typical UK prices for a chain and sprocket kit fitted, by engine size - why they’re replaced together, how to tell they’re worn, and how to make the next kit last.',
    summary: 'Chain and both sprockets, replaced together - and how to make a kit last.',
    intro:
      'The chain and both sprockets wear together, so they’re replaced as a set: a new chain on worn sprockets wears out quickly, and the other way round. How well the chain is looked after makes a big difference to how long a kit lasts.',
    includes: [
      'A new chain, and front and rear sprockets',
      'Fitting, including cutting the chain to length and joining it',
      'Setting the chain tension',
      'Lubrication',
    ],
    priceDrivers: [
      'Kit quality - O-ring and X-ring chains cost more but last much longer than plain chains.',
      'Chain size, which rises with engine size.',
      'Brand.',
      'Access - some bikes take longer to work on.',
    ],
    fairPriceTips: [
      'Keep the chain clean, lubricated and correctly tensioned - regularly, and after riding in the wet - to make a kit last.',
      'Check for wear: if you can pull the chain away from the back of the rear sprocket and see a lot of the tooth, or the teeth look hooked, it’s time.',
      'On bigger bikes, ask for a riveted link rather than a clip link.',
    ],
    redFlags: [
      'Only the chain or only the sprockets replaced - ask why.',
      'A more expensive upgraded kit fitted without asking you first.',
    ],
    faqs: [
      {
        q: 'Can I replace just the chain?',
        a: 'It’s rarely a good idea. A new chain on worn sprockets (or new sprockets with a worn chain) wears the new part out quickly, so they’re replaced together as a kit.',
      },
      {
        q: 'How long does a chain and sprocket kit last?',
        a: 'It depends on the kit, the bike and above all how well it’s maintained - a well-looked-after O-ring or X-ring kit lasts far longer than a neglected one.',
      },
    ],
    related: ['basic-service', 'full-service', 'tyres'],
  },
  {
    kind: 'mot',
    vehicle: 'motorcycle',
    slug: 'mot',
    name: 'MOT',
    quotedFor: 'an MOT',
    title: 'Motorcycle MOT Cost UK: The Maximum Fee and What’s Tested',
    h1: 'How much does a motorcycle MOT cost?',
    description:
      'The legal maximum MOT fee for a motorcycle in the UK, when a bike’s first MOT is due, what’s tested, and how to find a test centre that does bikes.',
    summary: 'Capped by law, and lower than a car’s - when it’s due and where to go.',
    intro:
      'Motorcycles need an MOT once they’re three years old, and every year after that. The maximum fee is set by law, and it’s lower than a car’s. Not every MOT centre can test motorcycles, so book one that’s approved for bikes.',
    fees: [
      { label: 'Motorcycle (up to 200cc)', maxFee: MOT_MAX_FEE.motorcycle },
      { label: 'Motorcycle (over 200cc)', maxFee: MOT_MAX_FEE.motorcycle },
      { label: 'Motorcycle with sidecar', maxFee: MOT_MAX_FEE.motorcycleWithSidecar },
    ],
    feeSummary: `The maximum MOT fee for a motorcycle is ${formatPounds(MOT_MAX_FEE.motorcycle)}, whatever the engine size, or ${formatPounds(MOT_MAX_FEE.motorcycleWithSidecar)} with a sidecar - set by law.`,
    keyFacts: MOT_KEY_FACTS_COMMON,
    includes: [
      'Brakes, steering, suspension, wheels and tyres',
      'Lights, horn and the registration plate',
      'The frame, for damage or corrosion',
      'The exhaust, for noise and security, and the fuel system for leaks',
      'The drive chain and sprockets',
    ],
    priceDrivers: [
      'The test itself is capped - what varies is how much under the cap a centre charges.',
      'Repairs to pass are separate.',
    ],
    fairPriceTips: [
      'Book a centre approved to test motorcycles - not every MOT station can.',
      'An MOT is a test, not a repair: if your bike fails, you can have the repairs done elsewhere.',
      'Ask about retests before booking: a partial retest is often free if the bike is repaired at the same centre and retested within 10 working days.',
    ],
    redFlags: [
      'Repairs presented as MOT failures that aren’t on the official test result, which is recorded against the bike and visible on GOV.UK.',
    ],
    faqs: [
      {
        q: 'When is a motorcycle’s first MOT due?',
        a: 'By the third anniversary of its registration, then every year. You can have it up to a month (minus a day) early and keep the same renewal date.',
      },
      {
        q: 'Can any MOT centre test my motorcycle?',
        a: 'No - motorcycles are tested at centres approved for them, and not every MOT station is. Check when you book.',
      },
    ],
    related: ['full-service', 'tyres', 'chain-and-sprockets'],
  },
];

export const PRICE_GUIDES: Record<GuideVehicle, PriceGuide[]> = {
  car: CAR_GUIDES,
  motorcycle: MOTORCYCLE_GUIDES,
};

export const VEHICLE_PATH: Record<GuideVehicle, string> = { car: '/cars', motorcycle: '/motorcycles' };
export const VEHICLE_LABEL: Record<GuideVehicle, { hub: string; noun: string }> = {
  car: { hub: 'Cars', noun: 'car' },
  motorcycle: { hub: 'Motorcycles', noun: 'motorcycle' },
};

export function priceGuideHubPath(vehicle: GuideVehicle): string {
  return `${VEHICLE_PATH[vehicle]}/costs`;
}

export function priceGuidePath(guide: PriceGuide): string {
  return `${priceGuideHubPath(guide.vehicle)}/${guide.slug}`;
}

export function findPriceGuide(vehicle: GuideVehicle, slug: string): PriceGuide | undefined {
  return PRICE_GUIDES[vehicle].find((g) => g.slug === slug);
}

export interface PriceRow {
  size: string;
  sizeLabel: string;
  low: number;
  high: number;
  confidence: ConfidenceLevel;
  sourceName: string;
  sourceDate: string;
  lastReviewed: string;
  note?: string;
}

// The table: one row per size class, straight from the benchmark tables.
export function priceRows(guide: BenchmarkGuide): PriceRow[] {
  if (guide.vehicle === 'car') {
    return (Object.keys(CAR_SIZE_CLASS_LABELS) as CarBenchmarkClass[]).map((size) => {
      const b = getInflationAdjustedCarBenchmark(guide.job, size);
      return { size, sizeLabel: CAR_SIZE_CLASS_LABELS[size], low: b.low, high: b.high, ...sourceFields(b.source) };
    });
  }
  return (Object.keys(BIKE_CLASS_LABELS) as BikeClass[]).map((size) => {
    const b = getInflationAdjustedBenchmark(guide.job, size);
    return { size, sizeLabel: BIKE_CLASS_LABELS[size], low: b.low, high: b.high, ...sourceFields(b.source) };
  });
}

function sourceFields(source: { sourceName: string; sourceDate: string; lastReviewed: string; confidence: ConfidenceLevel; note?: string }) {
  return {
    confidence: source.confidence,
    sourceName: source.sourceName,
    sourceDate: source.sourceDate,
    lastReviewed: source.lastReviewed,
    note: source.note,
  };
}

export function formatPounds(amount: number): string {
  return Number.isInteger(amount) ? `£${amount}` : `£${amount.toFixed(2)}`;
}

// "£150-£450" across every size - the one-line answer at the top of a page.
export function overallRange(guide: PriceGuide): { low: number; high: number } {
  if (guide.kind === 'mot') {
    const fees = guide.fees.map((f) => f.maxFee);
    return { low: Math.min(...fees), high: Math.max(...fees) };
  }
  const rows = priceRows(guide);
  return { low: Math.min(...rows.map((r) => r.low)), high: Math.max(...rows.map((r) => r.high)) };
}

// When the page's figures were last checked - for the "last reviewed" line
// and the sitemap's lastModified. Benchmark lastReviewed values are either
// a full date or a month ("2026-07"); the latest one wins.
export function lastReviewed(guide: PriceGuide): string {
  if (guide.kind === 'mot') return MOT_FEE_SOURCE.checked;
  const dates = priceRows(guide).map((r) => (r.lastReviewed.length === 7 ? `${r.lastReviewed}-01` : r.lastReviewed));
  return dates.sort().at(-1)!;
}

// The question every one of these pages exists to answer (its own H1),
// answered from the data rather than typed in - so the visible answer and
// the FAQ schema can never drift from the table.
export function costFaq(guide: PriceGuide): GuideFaq {
  if (guide.kind === 'mot') {
    return { q: guide.h1, a: `${guide.feeSummary} Test centres can charge less, and many do. You don’t pay VAT on the fee.` };
  }
  const noun = VEHICLE_LABEL[guide.vehicle].noun;
  const parts = priceRows(guide).map((r) => {
    const [, size, spec] = /^(\S+) \((.*)\)$/.exec(r.sizeLabel) ?? [null, r.sizeLabel, null];
    return `${formatPounds(r.low)}-${formatPounds(r.high)} for a ${size.toLowerCase()} ${noun}${spec ? ` (${spec})` : ''}`;
  });
  return {
    q: guide.h1,
    a: `Typically ${parts.join(', ')}, for mainstream brands. Premium brands, and garages in London and the South East, usually cost more.`,
  };
}

// Deep link into the matching Quote Checker, pre-selecting the job (and the
// size, when the link comes from one row of the table).
export function quoteCheckerHref(guide: BenchmarkGuide, size?: string): string {
  const base = guide.vehicle === 'car' ? '/cars/quote-checker' : '/quote-checker';
  const params = new URLSearchParams({ job: guide.job });
  if (size) params.set('size', size);
  return `${base}?${params.toString()}`;
}

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  higher: 'Well sourced',
  medium: 'Reasonably sourced',
  lower: 'Estimate',
};
