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
