// Place at: src/lib/tracker/modTypes.ts
//
// Modifications & accessories - one-off spend, not maintenance. No price
// benchmark (aftermarket part cost varies hugely by brand/quality) and no
// reminders (nothing wears out on a schedule) - just honest cost tracking.
export const MOD_LABELS: Record<string, string> = {
  "exhaust-headers": "Exhaust headers / downpipes",
  "exhaust-can": "Exhaust can / muffler",
  "suspension-upgrade": "Suspension upgrade",
  "tank-pads": "Tank pads / protectors",
  "decals-wrap": "Decals / wrap / graphics",
  "seat": "Seat (aftermarket/custom)",
  "crash-protection": "Crash protection (sliders, bars, bungs)",
  "screen": "Screen / windshield",
  "handlebars": "Handlebars / risers",
  "footpegs-rearsets": "Footpegs / rearsets",
  "mirrors": "Mirrors",
  "levers": "Levers (brake/clutch)",
  "luggage": "Luggage (panniers/top box/tank bag)",
  "lighting": "Lighting (LEDs, indicators)",
  "security": "Security (alarm, disc lock, tracker)",
  "custom-bespoke": "Custom/bespoke work",
  "other-accessory": "Other accessory",
};

export const MOD_GROUPS: { group: string; mods: string[] }[] = [
  { group: "Performance & exhaust", mods: ["exhaust-headers", "exhaust-can", "suspension-upgrade"] },
  { group: "Styling & protection", mods: ["tank-pads", "decals-wrap", "seat", "crash-protection"] },
  { group: "Comfort & practicality", mods: ["screen", "handlebars", "footpegs-rearsets", "mirrors", "levers", "luggage"] },
  { group: "Electronics & security", mods: ["lighting", "security"] },
  { group: "Other", mods: ["custom-bespoke", "other-accessory"] },
];
