// Phase 8 of the car build (RoadVerdict_Car_Plan_v3.md): mechanical guards
// against the exact bug class that mattered most while building the hybrid
// architecture - a shared component/route rendering the WRONG vehicle
// kind's catalog or copy, rather than a genuinely broken feature. These
// tests don't exercise behaviour; they scan real source/catalog content so
// a future edit can't silently reintroduce the leak.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

import { CAR_JOB_LABELS } from "@/lib/tracker/carJobTypes";
import { CAR_MOD_LABELS } from "@/lib/tracker/carModTypes";
import { CAR_BILL_LABELS } from "@/lib/tracker/carBillTypes";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { MOD_LABELS } from "@/lib/tracker/modTypes";
import { BILL_LABELS } from "@/lib/tracker/billTypes";
import { CAR_LABOUR_LABELS } from "@/lib/tracker/carLabourTypes";
import { LABOUR_LABELS } from "@/lib/tracker/labourTypes";

const ROOT = path.resolve(__dirname, "../..");
const BIKE_WORD = /\b(bike|bikes|motorcycle|motorcycles)\b/i;
const CAR_WORD = /\b(car|cars)\b/i;

// Pulls out only what a user could actually see: quoted/template string
// contents and JSX text nodes. Deliberately ignores // and /* */ comments
// and bare identifiers (import paths, type names) - those aren't copy, and
// this file's own prose-heavy comment style (see car.ts, carJobTypes.ts,
// etc.) would otherwise swamp the audit with matches that render to no one.
function extractUserVisibleText(relativePath: string): string[] {
  const raw = readFileSync(path.join(ROOT, relativePath), "utf-8");
  const noBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLineComments = noBlockComments
    .split("\n")
    .map((line) => (line.trim().startsWith("//") ? "" : line))
    .join("\n");

  const snippets: string[] = [];
  const stringRe = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  let m: RegExpExecArray | null;
  while ((m = stringRe.exec(noLineComments))) {
    const value = m[0].slice(1, -1);
    // A quoted string with no space is almost always a code value (an enum
    // literal like 'motorcycle', a URL segment like '/cars', a CSS class,
    // an object key) rather than user-visible copy - real sentences always
    // have a space. JSX text nodes (below) are kept regardless, since those
    // render verbatim no matter how short.
    if (value.includes(" ")) snippets.push(value);
  }

  const jsxTextRe = />([^<>{}]+)</g;
  while ((m = jsxTextRe.exec(noLineComments))) {
    const text = m[1].trim();
    if (text) snippets.push(text);
  }
  return snippets;
}

function findForbiddenSnippets(relativePath: string, forbidden: RegExp, allowlist: string[]): string[] {
  return extractUserVisibleText(relativePath).filter(
    (snippet) => forbidden.test(snippet) && !allowlist.some((allowed) => snippet.includes(allowed))
  );
}

describe("copy audit - car-only dashboard components never say bike/motorcycle", () => {
  // The one deliberate exception: AddCarForm's rejection message when a
  // motorcycle plate is entered in the car form, pointing the user at the
  // bike dashboard instead - the mirror of AddBikeForm's own four-wheeled
  // rejection. Same category as the ADR's approved cross-signpost copy.
  const ALLOWLIST = [
    "That looks like a motorcycle, not a car - you can track it from your bike dashboard instead.",
    "That looks like a motorcycle, not a car - check your quote from the motorcycle quote checker instead.",
    "That looks like a motorcycle, not a car - try the motorcycle cost calculator instead.",
  ];

  const CAR_ONLY_FILES = [
    "src/app/dashboard/AddCarForm.tsx",
    "src/app/dashboard/CarBillCard.tsx",
    "src/app/dashboard/CarFuelLogCard.tsx",
    "src/app/dashboard/CarModCard.tsx",
    "src/app/dashboard/CarReminderItem.tsx",
    "src/app/dashboard/CarServiceHistoryCard.tsx",
    "src/app/dashboard/LogCarBillForm.tsx",
    "src/app/dashboard/LogCarFuelForm.tsx",
    "src/app/dashboard/LogCarModForm.tsx",
    "src/app/dashboard/LogCarServiceForm.tsx",
    "src/app/dashboard/LogCarLabourForm.tsx",
    "src/app/dashboard/CarLabourCard.tsx",
    "src/app/dashboard/CarLabourSearchAutocomplete.tsx",
    "src/app/dashboard/CarModSearchAutocomplete.tsx",
    "src/app/dashboard/CarCustomFilterPanel.tsx",
    "src/app/garage/CarCard.tsx",
    "src/components/CarQuoteForm.tsx",
    "src/components/CarCostCalculatorForm.tsx",
    "src/components/CarBuyingGuideForm.tsx",
    "src/components/CarVerdictResult.tsx",
    "src/components/CarCostBreakdownResult.tsx",
    "src/components/CarBuyingGuideResult.tsx",
    "src/components/CarRelatedTools.tsx",
    "src/app/cars/quote-checker/page.tsx",
    "src/app/cars/cost-calculator/page.tsx",
    "src/app/cars/buying-guide/page.tsx",
  ];

  for (const file of CAR_ONLY_FILES) {
    it(file, () => {
      expect(findForbiddenSnippets(file, BIKE_WORD, ALLOWLIST)).toEqual([]);
    });
  }
});

describe("copy audit - bike-only dashboard components never say car", () => {
  // AddBikeForm's own signpost to /cars when a four-wheeled plate is
  // entered - the ADR's approved cross-product link, the reverse of the
  // exception above.
  const ALLOWLIST = ["Track your car on RoadVerdict for cars"];

  const BIKE_ONLY_FILES = [
    "src/app/dashboard/AddBikeForm.tsx",
    "src/app/dashboard/ServiceHistoryCard.tsx",
    "src/app/dashboard/FuelLogCard.tsx",
    "src/app/dashboard/ModCard.tsx",
    "src/app/dashboard/BillCard.tsx",
    "src/app/dashboard/LogLabourForm.tsx",
    "src/app/dashboard/LabourCard.tsx",
    "src/app/dashboard/LabourSearchAutocomplete.tsx",
  ];

  for (const file of BIKE_ONLY_FILES) {
    it(file, () => {
      expect(findForbiddenSnippets(file, CAR_WORD, ALLOWLIST)).toEqual([]);
    });
  }
});

describe("copy audit - catalog label values never cross vehicle kinds", () => {
  it("no CAR_JOB_LABELS/CAR_MOD_LABELS/CAR_BILL_LABELS/CAR_LABOUR_LABELS value mentions bike/motorcycle", () => {
    const merged = { ...CAR_JOB_LABELS, ...CAR_MOD_LABELS, ...CAR_BILL_LABELS, ...CAR_LABOUR_LABELS } as Record<string, string>;
    for (const [key, value] of Object.entries(merged)) {
      expect(BIKE_WORD.test(value), `${key}: "${value}"`).toBe(false);
    }
  });

  it("no JOB_LABELS/MOD_LABELS/BILL_LABELS/LABOUR_LABELS value mentions car", () => {
    const merged = { ...JOB_LABELS, ...MOD_LABELS, ...BILL_LABELS, ...LABOUR_LABELS } as Record<string, string>;
    for (const [key, value] of Object.entries(merged)) {
      expect(CAR_WORD.test(value), `${key}: "${value}"`).toBe(false);
    }
  });
});

describe("dashboard/page.tsx render paths never cross-reference the other vehicle kind's catalog", () => {
  const source = readFileSync(path.join(ROOT, "src/app/dashboard/page.tsx"), "utf-8");
  const carFnStart = source.indexOf("async function renderCarDashboard");
  const pageFnStart = source.indexOf("export default async function DashboardPage");
  if (carFnStart === -1) throw new Error("renderCarDashboard() not found - has dashboard/page.tsx been restructured?");
  if (pageFnStart === -1) throw new Error("DashboardPage() not found - has dashboard/page.tsx been restructured?");
  const carDashboardSource = source.slice(carFnStart);
  // Starts after the page function's own declaration, not from byte 0 -
  // the file's import block at the top legitimately imports CAR_JOB_LABELS
  // for renderCarDashboard's later use, which isn't a leak into the bike path.
  const bikeDashboardSource = source.slice(pageFnStart, carFnStart);

  it("renderCarDashboard never references the motorcycle JOB_LABELS/MOD_LABELS/LABOUR_LABELS catalogs", () => {
    expect(/\bJOB_LABELS\b/.test(carDashboardSource)).toBe(false);
    expect(/\bMOD_LABELS\b/.test(carDashboardSource)).toBe(false);
    expect(/(?<!CAR_)\bLABOUR_LABELS\b/.test(carDashboardSource)).toBe(false);
  });

  it("the bike-active render path never references the car CAR_JOB_LABELS/CAR_MOD_LABELS/CAR_LABOUR_LABELS catalogs", () => {
    expect(/\bCAR_JOB_LABELS\b/.test(bikeDashboardSource)).toBe(false);
    expect(/\bCAR_MOD_LABELS\b/.test(bikeDashboardSource)).toBe(false);
    expect(/\bCAR_LABOUR_LABELS\b/.test(bikeDashboardSource)).toBe(false);
  });
});
