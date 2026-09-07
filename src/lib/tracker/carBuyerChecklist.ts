// Place at: src/lib/tracker/carBuyerChecklist.ts
//
// Car equivalent of buyerChecklist.ts - same nature (compiled general
// car mechanical knowledge any competent pre-purchase check would cover,
// not model-specific research and not sourced from any single site),
// same "varies primarily by age, size adds a short addendum only"
// structure. Car-native copy throughout, not motorcycle wording with
// find-and-replace (see the ADR).
//
// Deliberately does NOT include a "fair asking price" number - same
// reasoning as the motorcycle checklist: real UK used-car resale price
// research is a separate, unbuilt thing (the buyer report), not this.
//
// No plate-lookup / AI briefing in this pass (see RoadVerdict_Car_Plan_v3.md's
// Phase 7 section) - brand/size/age-band selects only.
import type { AgeBand, Checklist } from "../buyerChecklist";
import type { CarSizeClass } from "./car";

export type { AgeBand, Checklist };

export const CAR_AGE_BAND_LABELS: Record<AgeBand, string> = {
  modern: "Modern (2015 onward)",
  used: "Used (2000–2014)",
  classic: "Classic (pre-2000)",
};

// Not carPriceData.ts's CAR_SIZE_CLASS_LABELS - that one has no
// 'electric' entry (benchmark-pricing-only, per the ADR's Phase 7 scope
// cut). A buying-guide checklist has no such gap, so this covers all 4
// CarSizeClass values. Shared by both the route and the form so the two
// can't drift apart.
export const CAR_CLASS_LABELS_FOR_BUYING_GUIDE: Record<CarSizeClass, string> = {
  small: "Small (up to 1.2L)",
  medium: "Medium (1.3-2.0L)",
  large: "Large (over 2.0L)",
  electric: "Electric",
};

export const CAR_CHECKLISTS: Record<AgeBand, Checklist> = {
  modern: {
    emphasis:
      "On a modern car, the paperwork and electronics matter more than the mechanical inspection - the mechanicals are usually sound if it's been serviced on schedule.",
    inspectionPoints: [
      "Outstanding recalls or unresolved manufacturer service bulletins for this exact model",
      "Full digital service history, not just a stamped book",
      "Dash for warning lights, and a diagnostic scan for stored fault codes if the seller allows it",
      "Tyre date codes, not just tread depth - modern tyres perish before they wear out",
      "Every advanced driver-assist feature actually functions (adaptive cruise, lane-keep, parking sensors/camera)",
    ],
    questionsForSeller: [
      "Has it ever thrown a warning light or fault code?",
      "Is there any outstanding finance or HP on the car?",
      "Why are you selling it?",
      "Has it been in an accident, or had any bodywork or glass replaced?",
    ],
  },
  used: {
    emphasis:
      "This is the middle ground - check both the mechanicals and the price. Neither can be assumed from the other.",
    inspectionPoints: [
      "Timing belt/chain service history if due by mileage - a snapped belt can write off the engine",
      "Corrosion underneath, especially around sills, subframes, and exhaust mounts",
      "Suspension bushes and dampers for wear on a test drive over rough surfaces",
      "Brake disc thickness and condition, not just pad wear",
      "Evidence of oil or coolant leaks around the engine bay and under the car",
    ],
    questionsForSeller: [
      "Has the timing belt/chain, clutch, or gearbox ever been serviced or replaced?",
      "Any history of overheating or coolant top-ups?",
      "Has it stood unused for long periods?",
      "Are the tyres actually the age you were told?",
    ],
  },
  classic: {
    emphasis:
      "On a classic, the inspection matters far more than any price benchmark - a sound original car is worth paying above 'typical' for, and a rough one isn't worth the 'typical' price at all.",
    inspectionPoints: [
      "Rust in the sills, floor pans, and wheel arches, not just surface cosmetic rust",
      "Oil weeping around the engine and gearbox gaskets",
      "Fuel system for staining or perished lines, and whether it matches the original listed setup",
      "Corrosion in the wiring loom and connectors - old looms fail more often than engines do",
      "Chassis and engine numbers matching the paperwork",
    ],
    questionsForSeller: [
      "Is this the original engine and chassis, matching the paperwork?",
      "What's been restored versus original?",
      "Who last drove it regularly, and how long has it been static?",
      "Is there a paper trail - old MOTs, invoices, club registration?",
    ],
  },
};

// Not benchmarked pricing (that's carPriceData.ts, deliberately excludes
// 'electric' per the ADR's Phase 7 scope cut) - this is checklist copy
// only, so it covers all 4 CarSizeClass values, EV included.
export const CAR_SIZE_CLASS_ADDENDUM: Record<CarSizeClass, string> = {
  small: "Small cars are commonly used as first cars or for short urban commutes - check for accident damage disproportionate to the age or mileage shown.",
  medium: "Check the running costs the seller mentions against RoadVerdict's own cost calculator - a suspiciously low fuel or servicing claim is worth double-checking.",
  large: "Bigger cars wear differently under low, short-journey mileage than high-mileage motorway use - ask about typical journeys, not just the odometer figure.",
  electric: "Ask for a recent battery State of Health (SoH) reading if the seller has one, and check for any brake disc corrosion - regenerative braking means the friction brakes see far less use, so discs can rust from underuse rather than wear out.",
};

/**
 * Brand-specific notes - deliberately sparse, same honesty as the
 * motorcycle checklist's own equivalent: only added where research
 * turned up something concrete and named, not filled in evenly across
 * all 41 brands to look complete. Starts empty - nothing yet meets that
 * bar for cars.
 */
export const CAR_BRAND_SPECIFIC_NOTES: Partial<Record<string, string[]>> = {};
