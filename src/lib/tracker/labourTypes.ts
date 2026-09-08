// Place at: src/lib/tracker/labourTypes.ts
//
// The motorcycle labour-cost catalog - a genuinely new record type
// (Labour), not a mod/service variant. Real workshop labour-operation
// wording, supplied directly by the user rather than compiled generically
// the way buyerChecklist.ts's inspection points are - closer in spirit to
// modTypes.ts's own "expanded from a real, larger source list" provenance
// than to a from-scratch catalog.
//
// Deduplicated from the original ~300-line source list: 10 items appeared
// under two categories there (a real workshop task can plausibly sit in
// either, but a catalog key can only live in one place). Each was kept in
// its single most specific category and dropped from the other:
//   - "Coolant replacement", "Cooling system flush": Cooling system only
//     (dropped from Routine servicing & maintenance)
//   - "Clutch cable adjustment/replacement", "Gear linkage adjustment",
//     "Rear brake pedal adjustment": Controls & cables only (dropped from
//     Clutch & gearbox / Brakes - these are control-adjustment tasks, not
//     component-replacement tasks)
//   - "Brake lever adjustment" / "Front brake lever adjustment": kept as
//     "Front brake lever adjustment" under Controls & cables only
//   - "Fuel tank removal/refitting": Fuel system only (dropped from
//     Bodywork & accessories)
//   - "Heated grip installation": Bodywork & accessories only (dropped
//     from Controls & cables - it's an accessory fitment, not a control
//     adjustment)
//   - "Brake inspection": Brakes only (dropped from MOT / inspection)
//   - "Head gasket replacement": folded into "Cylinder head gasket
//     replacement" (Engine) as the same job, not a separate entry
//
// Single-level groups (mirrors jobTypes.ts's JOB_GROUPS shape) - the
// source list has no third-level subdivision within a category, unlike
// modTypes.ts's deeper subgroup nesting.
export const LABOUR_LABELS: Record<string, string> = {
  // Routine servicing & maintenance
  "full-service": "Full motorcycle service",
  "interim-service": "Interim motorcycle service",
  "major-service": "Major motorcycle service",
  "oil-and-filter-replacement": "Engine oil and oil filter replacement",
  "engine-oil-replacement": "Engine oil replacement",
  "oil-filter-replacement": "Oil filter replacement",
  "air-filter-replacement": "Air filter replacement",
  "spark-plug-replacement": "Spark plug replacement",
  "spark-plug-inspection": "Spark plug inspection",
  "brake-fluid-replacement": "Brake fluid replacement",
  "clutch-fluid-replacement": "Clutch fluid replacement",
  "final-drive-oil-replacement": "Final drive oil replacement",
  "gearbox-oil-replacement": "Gearbox oil replacement",
  "general-lubrication-service": "General lubrication service",
  "fastener-torque-check": "Fastener and torque check",
  "general-inspection": "General motorcycle inspection",
  "pre-season-inspection": "Pre-season inspection",
  "winter-storage-preparation": "Winter storage preparation",
  "storage-recommissioning": "Motorcycle storage recommissioning",

  // Brakes
  "front-brake-pad-replacement": "Front brake pad replacement",
  "rear-brake-pad-replacement": "Rear brake pad replacement",
  "front-brake-disc-replacement": "Front brake disc replacement",
  "rear-brake-disc-replacement": "Rear brake disc replacement",
  "front-brake-caliper-removal-refitting": "Front brake caliper removal/refitting",
  "rear-brake-caliper-removal-refitting": "Rear brake caliper removal/refitting",
  "brake-caliper-cleaning": "Brake caliper cleaning",
  "brake-caliper-overhaul": "Brake caliper overhaul",
  "brake-bleeding": "Brake bleeding",
  "brake-system-flush": "Brake system flush",
  "brake-hose-replacement": "Brake hose replacement",
  "brake-master-cylinder-replacement": "Brake master cylinder replacement",
  "brake-master-cylinder-overhaul": "Brake master cylinder overhaul",
  "brake-inspection": "Brake inspection",
  "abs-system-inspection": "ABS system inspection",
  "abs-fault-diagnosis": "ABS fault diagnosis",
  "abs-sensor-replacement": "ABS sensor replacement",
  "brake-fluid-leak-diagnosis": "Brake fluid leak diagnosis",

  // Tyres & wheels
  "front-tyre-removal-fitting": "Front tyre removal and fitting",
  "rear-tyre-removal-fitting": "Rear tyre removal and fitting",
  "front-wheel-removal-refitting": "Front wheel removal/refitting",
  "rear-wheel-removal-refitting": "Rear wheel removal/refitting",
  "front-wheel-balancing": "Front wheel balancing",
  "rear-wheel-balancing": "Rear wheel balancing",
  "wheel-alignment": "Wheel alignment",
  "tyre-pressure-adjustment": "Tyre pressure adjustment",
  "tyre-puncture-repair": "Tyre puncture repair",
  "inner-tube-replacement": "Inner tube replacement",
  "rim-inspection": "Rim inspection",
  "wheel-bearing-inspection": "Wheel bearing inspection",
  "front-wheel-bearing-replacement": "Front wheel bearing replacement",
  "rear-wheel-bearing-replacement": "Rear wheel bearing replacement",
  "cush-drive-inspection-replacement": "Cush drive inspection/replacement",
  "wheel-spindle-removal-refitting": "Wheel spindle removal/refitting",
  "tyre-valve-replacement": "Tyre valve replacement",

  // Chain & final drive
  "drive-chain-inspection": "Drive chain inspection",
  "drive-chain-adjustment": "Drive chain adjustment",
  "drive-chain-cleaning": "Drive chain cleaning",
  "drive-chain-lubrication": "Drive chain lubrication",
  "chain-replacement": "Chain replacement",
  "front-sprocket-replacement": "Front sprocket replacement",
  "rear-sprocket-replacement": "Rear sprocket replacement",
  "chain-and-sprocket-replacement": "Chain and sprocket replacement",
  "chain-tension-adjustment": "Chain tension adjustment",
  "final-drive-inspection": "Final drive inspection",
  "sprocket-carrier-removal-refitting": "Sprocket carrier removal/refitting",
  "chain-alignment-adjustment": "Chain alignment adjustment",

  // Engine
  "engine-diagnostic-inspection": "Engine diagnostic inspection",
  "engine-fault-diagnosis": "Engine fault diagnosis",
  "engine-compression-test": "Engine compression test",
  "leak-down-test": "Leak-down test",
  "valve-clearance-inspection": "Valve clearance inspection",
  "valve-clearance-adjustment": "Valve clearance adjustment",
  "camshaft-removal-refitting": "Camshaft removal/refitting",
  "camshaft-inspection": "Camshaft inspection",
  "timing-chain-inspection": "Timing chain inspection",
  "timing-chain-replacement": "Timing chain replacement",
  "timing-adjustment": "Timing adjustment",
  "cam-timing-adjustment": "Cam timing adjustment",
  "cylinder-head-removal-refitting": "Cylinder head removal/refitting",
  "cylinder-head-overhaul": "Cylinder head overhaul",
  "cylinder-head-gasket-replacement": "Cylinder head gasket replacement",
  "rocker-cover-gasket-replacement": "Rocker cover gasket replacement",
  "engine-gasket-replacement": "Engine gasket replacement",
  "engine-seal-replacement": "Engine seal replacement",
  "crankshaft-inspection": "Crankshaft inspection",
  "piston-removal-refitting": "Piston removal/refitting",
  "piston-replacement": "Piston replacement",
  "piston-ring-replacement": "Piston ring replacement",
  "cylinder-inspection": "Cylinder inspection",
  "cylinder-replacement": "Cylinder replacement",
  "cylinder-honing": "Cylinder honing",
  "engine-removal-from-frame": "Engine removal from frame",
  "engine-refitting": "Engine refitting",
  "engine-strip-down": "Engine strip-down",
  "engine-rebuild": "Engine rebuild",
  "engine-overhaul": "Engine overhaul",
  "engine-reassembly": "Engine reassembly",
  "engine-leak-diagnosis": "Engine leak diagnosis",
  "oil-leak-diagnosis": "Oil leak diagnosis",
  "oil-leak-repair": "Oil leak repair",
  "engine-mounting-inspection": "Engine mounting inspection",
  "engine-mounting-replacement": "Engine mounting replacement",

  // Clutch & gearbox
  "clutch-inspection": "Clutch inspection",
  "clutch-adjustment": "Clutch adjustment",
  "clutch-hydraulic-bleeding": "Clutch hydraulic system bleeding",
  "clutch-plate-replacement": "Clutch plate replacement",
  "clutch-basket-replacement": "Clutch basket replacement",
  "clutch-spring-replacement": "Clutch spring replacement",
  "clutch-assembly-replacement": "Clutch assembly replacement",
  "clutch-master-cylinder-replacement": "Clutch master cylinder replacement",
  "clutch-slave-cylinder-replacement": "Clutch slave cylinder replacement",
  "gearbox-inspection": "Gearbox inspection",
  "gear-selection-fault-diagnosis": "Gear selection fault diagnosis",
  "gear-linkage-replacement": "Gear linkage replacement",
  "gearbox-removal": "Gearbox removal",
  "gearbox-overhaul": "Gearbox overhaul",
  "gearbox-rebuild": "Gearbox rebuild",
  "gear-selector-replacement": "Gear selector replacement",

  // Fuel system
  "fuel-system-inspection": "Fuel system inspection",
  "fuel-system-diagnosis": "Fuel system diagnosis",
  "carburettor-inspection": "Carburettor inspection",
  "carburettor-removal": "Carburettor removal",
  "carburettor-cleaning": "Carburettor cleaning",
  "carburettor-overhaul": "Carburettor overhaul",
  "carburettor-synchronisation": "Carburettor synchronisation",
  "carburettor-adjustment": "Carburettor adjustment",
  "fuel-injector-inspection": "Fuel injector inspection",
  "fuel-injector-removal-refitting": "Fuel injector removal/refitting",
  "fuel-injector-cleaning": "Fuel injector cleaning",
  "fuel-pump-replacement": "Fuel pump replacement",
  "fuel-pump-diagnosis": "Fuel pump diagnosis",
  "fuel-filter-replacement": "Fuel filter replacement",
  "fuel-hose-replacement": "Fuel hose replacement",
  "fuel-tank-removal-refitting": "Fuel tank removal/refitting",
  "fuel-tank-inspection": "Fuel tank inspection",
  "fuel-leak-diagnosis": "Fuel leak diagnosis",
  "fuel-system-flush": "Fuel system flush",

  // Cooling system
  "cooling-system-inspection": "Cooling system inspection",
  "coolant-replacement": "Coolant replacement",
  "cooling-system-flush": "Cooling system flush",
  "radiator-removal-refitting": "Radiator removal/refitting",
  "radiator-replacement": "Radiator replacement",
  "radiator-cleaning": "Radiator cleaning",
  "cooling-fan-inspection": "Cooling fan inspection",
  "cooling-fan-replacement": "Cooling fan replacement",
  "thermostat-replacement": "Thermostat replacement",
  "water-pump-inspection": "Water pump inspection",
  "water-pump-replacement": "Water pump replacement",
  "coolant-hose-replacement": "Coolant hose replacement",
  "cooling-system-pressure-test": "Cooling system pressure test",
  "cooling-system-leak-diagnosis": "Cooling system leak diagnosis",

  // Electrical & electronics
  "electrical-system-diagnosis": "Electrical system diagnosis",
  "electrical-fault-finding": "Electrical fault finding",
  "wiring-inspection": "Wiring inspection",
  "wiring-repair": "Wiring repair",
  "wiring-harness-replacement": "Wiring harness replacement",
  "battery-replacement": "Battery replacement",
  "battery-testing": "Battery testing",
  "charging-system-diagnosis": "Charging system diagnosis",
  "alternator-stator-inspection": "Alternator/stator inspection",
  "stator-replacement": "Stator replacement",
  "regulator-rectifier-replacement": "Regulator/rectifier replacement",
  "starter-motor-inspection": "Starter motor inspection",
  "starter-motor-replacement": "Starter motor replacement",
  "starter-relay-replacement": "Starter relay replacement",
  "ignition-system-diagnosis": "Ignition system diagnosis",
  "ignition-coil-replacement": "Ignition coil replacement",
  "spark-plug-cap-replacement": "Spark plug cap replacement",
  "ecu-diagnostic-scan": "ECU diagnostic scan",
  "ecu-fault-diagnosis": "ECU fault diagnosis",
  "ecu-replacement-programming": "ECU replacement/programming",
  "sensor-diagnosis": "Sensor diagnosis",
  "sensor-replacement": "Sensor replacement",
  "abs-electrical-diagnosis": "ABS electrical diagnosis",
  "headlight-replacement": "Headlight replacement",
  "indicator-replacement": "Indicator replacement",
  "rear-light-replacement": "Rear light replacement",
  "horn-replacement": "Horn replacement",
  "switch-replacement": "Switch replacement",
  "fuse-replacement": "Fuse replacement",
  "immobiliser-diagnosis": "Immobiliser diagnosis",
  "key-immobiliser-programming": "Key/immobiliser programming",

  // Suspension & steering
  "front-suspension-inspection": "Front suspension inspection",
  "rear-suspension-inspection": "Rear suspension inspection",
  "fork-inspection": "Fork inspection",
  "fork-oil-replacement": "Fork oil replacement",
  "fork-seal-replacement": "Fork seal replacement",
  "fork-dust-seal-replacement": "Fork dust seal replacement",
  "fork-removal-refitting": "Fork removal/refitting",
  "fork-overhaul": "Fork overhaul",
  "fork-alignment": "Fork alignment",
  "rear-shock-removal-refitting": "Rear shock absorber removal/refitting",
  "rear-shock-replacement": "Rear shock absorber replacement",
  "rear-suspension-linkage-service": "Rear suspension linkage service",
  "suspension-linkage-bearing-replacement": "Suspension linkage bearing replacement",
  "steering-head-bearing-inspection": "Steering head bearing inspection",
  "steering-head-bearing-replacement": "Steering head bearing replacement",
  "steering-head-adjustment": "Steering head adjustment",
  "steering-alignment": "Steering alignment",
  "handlebar-removal-refitting": "Handlebar removal/refitting",
  "handlebar-replacement": "Handlebar replacement",
  "steering-fault-diagnosis": "Steering fault diagnosis",

  // Controls & cables
  "throttle-adjustment": "Throttle adjustment",
  "throttle-cable-replacement": "Throttle cable replacement",
  "clutch-cable-adjustment": "Clutch cable adjustment",
  "clutch-cable-replacement": "Clutch cable replacement",
  "choke-cable-replacement": "Choke cable replacement",
  "choke-adjustment": "Choke adjustment",
  "front-brake-lever-adjustment": "Front brake lever adjustment",
  "rear-brake-pedal-adjustment": "Rear brake pedal adjustment",
  "gear-lever-adjustment": "Gear lever adjustment",
  "gear-linkage-adjustment": "Gear linkage adjustment",
  "footrest-replacement": "Footrest replacement",
  "handlebar-control-replacement": "Handlebar control replacement",
  "cruise-control-installation": "Cruise control installation",

  // Exhaust
  "exhaust-system-inspection": "Exhaust system inspection",
  "exhaust-removal-refitting": "Exhaust removal/refitting",
  "exhaust-replacement": "Exhaust replacement",
  "silencer-replacement": "Silencer replacement",
  "exhaust-gasket-replacement": "Exhaust gasket replacement",
  "exhaust-leak-diagnosis": "Exhaust leak diagnosis",
  "exhaust-leak-repair": "Exhaust leak repair",
  "exhaust-mounting-repair": "Exhaust mounting repair",
  "exhaust-valve-inspection": "Exhaust valve inspection",
  "exhaust-valve-diagnosis": "Exhaust valve diagnosis",

  // Bodywork & accessories
  "fairing-removal-refitting": "Fairing removal/refitting",
  "fairing-panel-replacement": "Fairing panel replacement",
  "fairing-repair": "Fairing repair",
  "seat-removal-refitting": "Seat removal/refitting",
  "seat-replacement": "Seat replacement",
  "mudguard-replacement": "Mudguard replacement",
  "windscreen-replacement": "Windscreen replacement",
  "mirror-replacement": "Mirror replacement",
  "crash-protection-installation": "Crash protection installation",
  "luggage-rack-installation": "Luggage rack installation",
  "top-box-installation": "Top box installation",
  "pannier-installation": "Pannier installation",
  "heated-grip-installation": "Heated grip installation",
  "usb-charger-installation": "USB charger installation",
  "auxiliary-light-installation": "Auxiliary light installation",
  "accessory-wiring-installation": "Accessory wiring installation",

  // Diagnostics
  "general-diagnostic-assessment": "General diagnostic assessment",
  "engine-diagnostic-scan": "Engine diagnostic scan",
  "ecu-fault-code-scan": "ECU fault-code scan",
  "abs-diagnostic-scan": "ABS diagnostic scan",
  "electrical-diagnostic-assessment": "Electrical diagnostic assessment",
  "starting-problem-diagnosis": "Starting problem diagnosis",
  "charging-problem-diagnosis": "Charging problem diagnosis",
  "misfire-diagnosis": "Misfire diagnosis",
  "poor-running-diagnosis": "Poor running diagnosis",
  "overheating-diagnosis": "Overheating diagnosis",
  "fuel-consumption-diagnosis": "Fuel consumption diagnosis",
  "oil-consumption-diagnosis": "Oil consumption diagnosis",
  "noise-vibration-diagnosis": "Noise/vibration diagnosis",
  "gear-selection-diagnosis": "Gear selection diagnosis",
  "clutch-fault-diagnosis": "Clutch fault diagnosis",
  "brake-fault-diagnosis": "Brake fault diagnosis",
  "suspension-fault-diagnosis": "Suspension fault diagnosis",
  "steering-fault-diagnosis-general": "Steering fault diagnosis (general)",
  "intermittent-fault-diagnosis": "Intermittent fault diagnosis",

  // MOT / inspection
  "mot-preparation": "MOT preparation",
  "pre-mot-inspection": "Pre-MOT inspection",
  "safety-inspection": "Motorcycle safety inspection",
  "roadworthiness-inspection": "Roadworthiness inspection",
  "lighting-inspection": "Lighting inspection",
  "tyre-inspection": "Tyre inspection",
  "steering-suspension-inspection": "Steering and suspension inspection",
  "emissions-inspection": "Emissions inspection",
  "post-mot-repair-work": "Post-MOT repair work",
  "mot-failure-diagnosis": "MOT failure diagnosis",
  "mot-retest-preparation": "MOT retest preparation",

  // Recovery & workshop services
  "motorcycle-collection": "Motorcycle collection",
  "motorcycle-delivery": "Motorcycle delivery",
  "motorcycle-loading-unloading": "Motorcycle loading/unloading",
  "motorcycle-assembly": "Motorcycle assembly",
  "motorcycle-disassembly": "Motorcycle disassembly",
  "strip-and-assess": "Strip and assess",
  "fault-investigation": "Fault investigation",
  "corrosion-inspection": "Corrosion inspection",
  "seized-component-removal": "Seized component removal",
  "broken-bolt-removal": "Broken bolt removal",
  "thread-repair": "Thread repair",
  "fastener-replacement": "Fastener replacement",
  "general-mechanical-repair": "General mechanical repair",
  "workshop-diagnostic-time": "Workshop diagnostic time",
  "additional-labour-time": "Additional labour time",
  "specialist-repair-labour": "Specialist repair labour",
  "road-test": "Road test",
  "final-inspection-quality-check": "Final inspection and quality check",

  // Restoration / specialist work
  "restoration-assessment": "Motorcycle restoration assessment",
  "motorcycle-strip-down": "Motorcycle strip-down",
  "motorcycle-reassembly": "Motorcycle reassembly",
  "engine-restoration": "Engine restoration",
  "carburettor-restoration": "Carburettor restoration",
  "fuel-system-restoration": "Fuel system restoration",
  "electrical-system-restoration": "Electrical system restoration",
  "frame-inspection": "Frame inspection",
  "frame-component-removal-refitting": "Frame component removal/refitting",
  "classic-servicing": "Classic motorcycle servicing",
  "classic-fault-diagnosis": "Classic motorcycle fault diagnosis",
  "custom-modification": "Custom motorcycle modification",
  "custom-wiring-installation": "Custom wiring installation",
  "performance-tuning": "Performance tuning",
  "dyno-setup-tuning": "Dyno setup/tuning",
  "ecu-remapping": "ECU remapping",
  "suspension-setup": "Suspension setup",
  "track-day-preparation": "Track-day preparation",
  "race-preparation": "Race motorcycle preparation",
  "post-track-inspection": "Post-track inspection",

  "other": "Other",
};

export interface LabourGroup {
  group: string;
  jobs: string[];
}

export const LABOUR_GROUPS: LabourGroup[] = [
  {
    group: "Routine servicing & maintenance",
    jobs: ["full-service", "interim-service", "major-service", "oil-and-filter-replacement", "engine-oil-replacement", "oil-filter-replacement", "air-filter-replacement", "spark-plug-replacement", "spark-plug-inspection", "brake-fluid-replacement", "clutch-fluid-replacement", "final-drive-oil-replacement", "gearbox-oil-replacement", "general-lubrication-service", "fastener-torque-check", "general-inspection", "pre-season-inspection", "winter-storage-preparation", "storage-recommissioning"],
  },
  {
    group: "Brakes",
    jobs: ["front-brake-pad-replacement", "rear-brake-pad-replacement", "front-brake-disc-replacement", "rear-brake-disc-replacement", "front-brake-caliper-removal-refitting", "rear-brake-caliper-removal-refitting", "brake-caliper-cleaning", "brake-caliper-overhaul", "brake-bleeding", "brake-system-flush", "brake-hose-replacement", "brake-master-cylinder-replacement", "brake-master-cylinder-overhaul", "brake-inspection", "abs-system-inspection", "abs-fault-diagnosis", "abs-sensor-replacement", "brake-fluid-leak-diagnosis"],
  },
  {
    group: "Tyres & wheels",
    jobs: ["front-tyre-removal-fitting", "rear-tyre-removal-fitting", "front-wheel-removal-refitting", "rear-wheel-removal-refitting", "front-wheel-balancing", "rear-wheel-balancing", "wheel-alignment", "tyre-pressure-adjustment", "tyre-puncture-repair", "inner-tube-replacement", "rim-inspection", "wheel-bearing-inspection", "front-wheel-bearing-replacement", "rear-wheel-bearing-replacement", "cush-drive-inspection-replacement", "wheel-spindle-removal-refitting", "tyre-valve-replacement"],
  },
  {
    group: "Chain & final drive",
    jobs: ["drive-chain-inspection", "drive-chain-adjustment", "drive-chain-cleaning", "drive-chain-lubrication", "chain-replacement", "front-sprocket-replacement", "rear-sprocket-replacement", "chain-and-sprocket-replacement", "chain-tension-adjustment", "final-drive-inspection", "sprocket-carrier-removal-refitting", "chain-alignment-adjustment"],
  },
  {
    group: "Engine",
    jobs: ["engine-diagnostic-inspection", "engine-fault-diagnosis", "engine-compression-test", "leak-down-test", "valve-clearance-inspection", "valve-clearance-adjustment", "camshaft-removal-refitting", "camshaft-inspection", "timing-chain-inspection", "timing-chain-replacement", "timing-adjustment", "cam-timing-adjustment", "cylinder-head-removal-refitting", "cylinder-head-overhaul", "cylinder-head-gasket-replacement", "rocker-cover-gasket-replacement", "engine-gasket-replacement", "engine-seal-replacement", "crankshaft-inspection", "piston-removal-refitting", "piston-replacement", "piston-ring-replacement", "cylinder-inspection", "cylinder-replacement", "cylinder-honing", "engine-removal-from-frame", "engine-refitting", "engine-strip-down", "engine-rebuild", "engine-overhaul", "engine-reassembly", "engine-leak-diagnosis", "oil-leak-diagnosis", "oil-leak-repair", "engine-mounting-inspection", "engine-mounting-replacement"],
  },
  {
    group: "Clutch & gearbox",
    jobs: ["clutch-inspection", "clutch-adjustment", "clutch-hydraulic-bleeding", "clutch-plate-replacement", "clutch-basket-replacement", "clutch-spring-replacement", "clutch-assembly-replacement", "clutch-master-cylinder-replacement", "clutch-slave-cylinder-replacement", "gearbox-inspection", "gear-selection-fault-diagnosis", "gear-linkage-replacement", "gearbox-removal", "gearbox-overhaul", "gearbox-rebuild", "gear-selector-replacement"],
  },
  {
    group: "Fuel system",
    jobs: ["fuel-system-inspection", "fuel-system-diagnosis", "carburettor-inspection", "carburettor-removal", "carburettor-cleaning", "carburettor-overhaul", "carburettor-synchronisation", "carburettor-adjustment", "fuel-injector-inspection", "fuel-injector-removal-refitting", "fuel-injector-cleaning", "fuel-pump-replacement", "fuel-pump-diagnosis", "fuel-filter-replacement", "fuel-hose-replacement", "fuel-tank-removal-refitting", "fuel-tank-inspection", "fuel-leak-diagnosis", "fuel-system-flush"],
  },
  {
    group: "Cooling system",
    jobs: ["cooling-system-inspection", "coolant-replacement", "cooling-system-flush", "radiator-removal-refitting", "radiator-replacement", "radiator-cleaning", "cooling-fan-inspection", "cooling-fan-replacement", "thermostat-replacement", "water-pump-inspection", "water-pump-replacement", "coolant-hose-replacement", "cooling-system-pressure-test", "cooling-system-leak-diagnosis"],
  },
  {
    group: "Electrical & electronics",
    jobs: ["electrical-system-diagnosis", "electrical-fault-finding", "wiring-inspection", "wiring-repair", "wiring-harness-replacement", "battery-replacement", "battery-testing", "charging-system-diagnosis", "alternator-stator-inspection", "stator-replacement", "regulator-rectifier-replacement", "starter-motor-inspection", "starter-motor-replacement", "starter-relay-replacement", "ignition-system-diagnosis", "ignition-coil-replacement", "spark-plug-cap-replacement", "ecu-diagnostic-scan", "ecu-fault-diagnosis", "ecu-replacement-programming", "sensor-diagnosis", "sensor-replacement", "abs-electrical-diagnosis", "headlight-replacement", "indicator-replacement", "rear-light-replacement", "horn-replacement", "switch-replacement", "fuse-replacement", "immobiliser-diagnosis", "key-immobiliser-programming"],
  },
  {
    group: "Suspension & steering",
    jobs: ["front-suspension-inspection", "rear-suspension-inspection", "fork-inspection", "fork-oil-replacement", "fork-seal-replacement", "fork-dust-seal-replacement", "fork-removal-refitting", "fork-overhaul", "fork-alignment", "rear-shock-removal-refitting", "rear-shock-replacement", "rear-suspension-linkage-service", "suspension-linkage-bearing-replacement", "steering-head-bearing-inspection", "steering-head-bearing-replacement", "steering-head-adjustment", "steering-alignment", "handlebar-removal-refitting", "handlebar-replacement", "steering-fault-diagnosis"],
  },
  {
    group: "Controls & cables",
    jobs: ["throttle-adjustment", "throttle-cable-replacement", "clutch-cable-adjustment", "clutch-cable-replacement", "choke-cable-replacement", "choke-adjustment", "front-brake-lever-adjustment", "rear-brake-pedal-adjustment", "gear-lever-adjustment", "gear-linkage-adjustment", "footrest-replacement", "handlebar-control-replacement", "cruise-control-installation"],
  },
  {
    group: "Exhaust",
    jobs: ["exhaust-system-inspection", "exhaust-removal-refitting", "exhaust-replacement", "silencer-replacement", "exhaust-gasket-replacement", "exhaust-leak-diagnosis", "exhaust-leak-repair", "exhaust-mounting-repair", "exhaust-valve-inspection", "exhaust-valve-diagnosis"],
  },
  {
    group: "Bodywork & accessories",
    jobs: ["fairing-removal-refitting", "fairing-panel-replacement", "fairing-repair", "seat-removal-refitting", "seat-replacement", "mudguard-replacement", "windscreen-replacement", "mirror-replacement", "crash-protection-installation", "luggage-rack-installation", "top-box-installation", "pannier-installation", "heated-grip-installation", "usb-charger-installation", "auxiliary-light-installation", "accessory-wiring-installation"],
  },
  {
    group: "Diagnostics",
    jobs: ["general-diagnostic-assessment", "engine-diagnostic-scan", "ecu-fault-code-scan", "abs-diagnostic-scan", "electrical-diagnostic-assessment", "starting-problem-diagnosis", "charging-problem-diagnosis", "misfire-diagnosis", "poor-running-diagnosis", "overheating-diagnosis", "fuel-consumption-diagnosis", "oil-consumption-diagnosis", "noise-vibration-diagnosis", "gear-selection-diagnosis", "clutch-fault-diagnosis", "brake-fault-diagnosis", "suspension-fault-diagnosis", "steering-fault-diagnosis-general", "intermittent-fault-diagnosis"],
  },
  {
    group: "MOT / inspection",
    jobs: ["mot-preparation", "pre-mot-inspection", "safety-inspection", "roadworthiness-inspection", "lighting-inspection", "tyre-inspection", "steering-suspension-inspection", "emissions-inspection", "post-mot-repair-work", "mot-failure-diagnosis", "mot-retest-preparation"],
  },
  {
    group: "Recovery & workshop services",
    jobs: ["motorcycle-collection", "motorcycle-delivery", "motorcycle-loading-unloading", "motorcycle-assembly", "motorcycle-disassembly", "strip-and-assess", "fault-investigation", "corrosion-inspection", "seized-component-removal", "broken-bolt-removal", "thread-repair", "fastener-replacement", "general-mechanical-repair", "workshop-diagnostic-time", "additional-labour-time", "specialist-repair-labour", "road-test", "final-inspection-quality-check"],
  },
  {
    group: "Restoration / specialist work",
    jobs: ["restoration-assessment", "motorcycle-strip-down", "motorcycle-reassembly", "engine-restoration", "carburettor-restoration", "fuel-system-restoration", "electrical-system-restoration", "frame-inspection", "frame-component-removal-refitting", "classic-servicing", "classic-fault-diagnosis", "custom-modification", "custom-wiring-installation", "performance-tuning", "dyno-setup-tuning", "ecu-remapping", "suspension-setup", "track-day-preparation", "race-preparation", "post-track-inspection"],
  },
  {
    group: "Other",
    jobs: ["other"],
  },
];

// Reverse map for the free-text search box (LabourSearchAutocomplete.tsx),
// same role as modTypes.ts's MOD_LABEL_TO_KEY.
export const LABOUR_LABEL_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(LABOUR_LABELS).map(([key, label]) => [label, key])
);

export function findGroupForLabourCategory(category: string): string | undefined {
  return LABOUR_GROUPS.find((g) => g.jobs.includes(category))?.group;
}
