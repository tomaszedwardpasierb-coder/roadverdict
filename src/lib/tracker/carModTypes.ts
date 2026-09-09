// Place at: src/lib/tracker/carModTypes.ts
//
// The car equivalent of modTypes.ts's MOD_LABELS - a different
// accessory culture entirely (see the ADR), deliberately far shorter
// than the motorcycle catalog's 250+ entries rather than padded to
// match it. "other-accessory" is the safe universal fallback, same
// role and same key name as the motorcycle catalog's own fallback.
export const CAR_MOD_LABELS: Record<string, string> = {
  "dash-cam": "Dash cam",
  "tow-bar": "Tow bar / tow hitch",
  "roof-bars": "Roof bars / rack",
  "alloy-wheels": "Alloy wheels",
  "window-tint": "Window tinting",
  "seat-covers": "Seat covers",
  "floor-mats": "Floor mats",
  "boot-liner": "Boot liner",
  "child-seat": "Child seat / ISOFIX base",
  "phone-mount": "Phone mount",
  "parking-sensors": "Parking sensors",
  "reverse-camera": "Reverse camera",
  "ecu-remap": "ECU remap",
  "exhaust": "Exhaust upgrade",
  "suspension": "Suspension upgrade",
  "security-tracker": "Security tracker (GPS)",
  "steering-wheel": "Steering wheel (aftermarket)",
  "custom-bespoke": "Custom / bespoke work",
  "other-accessory": "Other accessory",
};

// The car equivalent of modTypes.ts's ModGroup/MOD_GROUPS - same shape
// (group + subgroups), deliberately flat (one "General" subgroup per
// group) rather than mirroring the motorcycle catalog's further
// subdivision, since this whole catalog is a fraction of its size.
export interface CarModSubgroup {
  subcategory: string;
  mods: string[];
}

export interface CarModGroup {
  group: string;
  subgroups: CarModSubgroup[];
}

export const CAR_MOD_GROUPS: CarModGroup[] = [
  { group: "Performance", subgroups: [{ subcategory: "General", mods: ["ecu-remap", "exhaust", "suspension"] }] },
  { group: "Styling & wheels", subgroups: [{ subcategory: "General", mods: ["alloy-wheels", "window-tint", "steering-wheel"] }] },
  { group: "Comfort & practicality", subgroups: [{ subcategory: "General", mods: ["seat-covers", "floor-mats", "boot-liner", "child-seat"] }] },
  { group: "Electronics & tech", subgroups: [{ subcategory: "General", mods: ["dash-cam", "phone-mount", "parking-sensors", "reverse-camera"] }] },
  { group: "Towing & touring", subgroups: [{ subcategory: "General", mods: ["tow-bar", "roof-bars"] }] },
  { group: "Security", subgroups: [{ subcategory: "General", mods: ["security-tracker"] }] },
  { group: "Other", subgroups: [{ subcategory: "General", mods: ["custom-bespoke", "other-accessory"] }] },
];

// Given a category key, finds which top-level group it belongs to - the
// car equivalent of modTypes.ts's findGroupForCategory.
export function findGroupForCarCategory(category: string): string {
  for (const g of CAR_MOD_GROUPS) {
    for (const sg of g.subgroups) {
      if (sg.mods.includes(category)) return g.group;
    }
  }
  return CAR_MOD_GROUPS[0].group;
}

// Reverse lookup for the search box - the car equivalent of
// modTypes.ts's MOD_LABEL_TO_KEY.
export const CAR_MOD_LABEL_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(CAR_MOD_LABELS).map(([key, label]) => [label, key])
);
