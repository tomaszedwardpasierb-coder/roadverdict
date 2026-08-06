import type { BikeClass } from './priceData';

/**
 * This is compiled general motorcycle mechanical knowledge — common
 * inspection points any competent pre-purchase check would cover — not
 * model-specific research and not sourced from any single site. Varies
 * primarily by AGE, because age is what actually changes what's worth
 * checking (a fuel-injected 2022 bike and a carburetted 1985 bike fail in
 * different ways). Bike-class only adds a short addendum, not a fully
 * separate checklist — there isn't a real basis for claiming size-specific
 * fault patterns beyond general common sense.
 *
 * Deliberately does NOT include a "fair asking price" number. See the note
 * on the page itself for why.
 *
 * Wording note: avoid presuming a specific mechanism (e.g. "timing chain")
 * where brands genuinely differ in how a valve train is driven — a Royal
 * Enfield question flagged exactly this. Phrase generically ("cam drive")
 * unless the point is true across every brand this checklist gets shown for.
 */

export type AgeBand = 'modern' | 'used' | 'classic';

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  modern: 'Modern (2015 onward)',
  used: 'Used (2000–2014)',
  classic: 'Classic (pre-2000)',
};

export interface Checklist {
  emphasis: string;
  inspectionPoints: string[];
  questionsForSeller: string[];
}

export const CHECKLISTS: Record<AgeBand, Checklist> = {
  modern: {
    emphasis:
      "On a modern bike, the paperwork and price matter more than the mechanical inspection - the mechanicals are usually sound if it's been serviced.",
    inspectionPoints: [
      'Outstanding recalls or unresolved manufacturer service bulletins',
      'Full digital service history, not just a stamped book',
      'Tyre date codes, not just tread depth - modern tyres perish before they wear out',
      'Dash for fault codes, and test ABS/traction control/quickshifter if fitted',
    ],
    questionsForSeller: [
      'Has it ever thrown a fault code or warning light?',
      'Is there any outstanding finance or HP on the bike?',
      'Why are you selling it?',
      'Has it been dropped, or had any bodywork replaced?',
    ],
  },
  used: {
    emphasis:
      "This is the middle ground - check both the mechanicals and the price. Neither can be assumed from the other.",
    inspectionPoints: [
      'Fork seals for weeping oil',
      'Chain and sprockets for wear, even if recently "adjusted"',
      'Corrosion around the headstock loom and electrical connectors',
      'Brake disc thickness, not just pad wear',
      'Whether valve clearances have ever been checked, if due by mileage',
    ],
    questionsForSeller: [
      'Has the cam drive or valve clearances ever been checked or serviced?',
      'Any history of charging system or battery issues?',
      'Has it stood unused for long periods?',
      'Are the tyres actually the age you were told?',
    ],
  },
  classic: {
    emphasis:
      "On a classic, the inspection matters far more than any price benchmark - a sound original bike is worth paying above 'typical' for, and a rough one isn't worth the 'typical' price at all.",
    inspectionPoints: [
      'Oil weeping around gaskets and pushrod tubes',
      'Carburettors for fuel staining, and whether they match the original listed type',
      'Rust in the frame and fuel tank, not just surface cosmetic rust',
      'Corrosion in electrical connectors - old looms fail more often than engines do',
      'Frame and engine numbers matching the paperwork',
    ],
    questionsForSeller: [
      'Is this the original engine and frame, matching the paperwork?',
      "What's been restored versus original?",
      'Who last rode it regularly, and how long has it been static?',
      'Is there a paper trail - old MOTs, invoices, club registration?',
    ],
  },
};

export const BIKE_CLASS_ADDENDUM: Record<BikeClass, string> = {
  small:
    'Small bikes are commonly used for CBT training or as a first bike - check for accident damage disproportionate to the age or mileage shown.',
  medium:
    "Check the service costs the seller mentions against RoadVerdict's own cost calculator - a suspiciously low running-cost claim is worth double-checking.",
  large:
    'Bigger bikes wear differently under low, short-journey mileage than high-mileage touring use - ask about riding style, not just the odometer figure.',
};

/**
 * Brand-specific notes — deliberately sparse. Only added where actual search
 * turned up something concrete and named, not filled in evenly across all
 * 13 brands to look complete. This is the honest version of "make the
 * checklist brand-aware": researched incrementally, same as priceData.ts,
 * rather than generated in one pass and left unaudited.
 *
 * royal-enfield: sourced from owner-forum reports (Quora, a long-term 650
 * twin owner writeup, a 2-month ownership review) — real, but forum-level
 * anecdote, not a manufacturer bulletin or aggregated repairer data. Treat
 * with the same caution as the thinner price figures in priceData.ts.
 */
export const BRAND_SPECIFIC_NOTES: Partial<Record<string, string[]>> = {
  'royal-enfield': [
    'Owner reports point to electronics (spark plug, throttle position sensor, O2 sensor, crank position sensor) as more failure-prone than the engine internals - worth a quick check even though these are cheap, easy fixes if needed.',
    'Some owners report instrument cluster water ingress after washing, and surface rust on the brake rotor - cosmetic more often than structural, but worth a look.',
  ],
};
