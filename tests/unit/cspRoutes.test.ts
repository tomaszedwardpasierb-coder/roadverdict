import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_STATIC_SEGMENTS, STRICT_CSP_SEGMENTS, usesStrictNonceCsp } from "../../src/lib/cspRoutes";

const APP_DIR = path.resolve(__dirname, "../../src/app");

function hasRoute(dir: string): boolean {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /^(page|route)\.(tsx|ts)$/.test(entry.name)) return true;
    if (entry.isDirectory() && hasRoute(path.join(dir, entry.name))) return true;
  }
  return false;
}

const topLevelSegments = fs
  .readdirSync(APP_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("("))
  .filter((e) => hasRoute(path.join(APP_DIR, e.name)))
  .map((e) => e.name);

describe("CSP route classification", () => {
  // Fails when someone adds a new top-level route without deciding which
  // policy it needs. Classifying it as strict when it's actually prerendered
  // leaves its inline scripts blocked (the page never hydrates); classifying
  // it as public when it renders per-request with account data quietly
  // weakens its script-src. Neither should happen by default.
  it("every top-level route segment is explicitly classified as strict or public", () => {
    const classified = new Set<string>([...STRICT_CSP_SEGMENTS, ...PUBLIC_STATIC_SEGMENTS]);
    const unclassified = topLevelSegments.filter((s) => !classified.has(s));
    expect(unclassified, `Unclassified route segment(s) in src/app: ${unclassified.join(", ")} - add each to STRICT_CSP_SEGMENTS or PUBLIC_STATIC_SEGMENTS in src/lib/cspRoutes.ts`).toEqual([]);
  });

  it("no segment is listed as both strict and public", () => {
    const overlap = STRICT_CSP_SEGMENTS.filter((s) => (PUBLIC_STATIC_SEGMENTS as readonly string[]).includes(s));
    expect(overlap).toEqual([]);
  });

  it("every listed segment corresponds to a real route directory, so a rename can't leave a stale entry behind", () => {
    const stale = [...STRICT_CSP_SEGMENTS, ...PUBLIC_STATIC_SEGMENTS].filter((s) => s !== "" && !topLevelSegments.includes(s));
    expect(stale).toEqual([]);
  });

  it("usesStrictNonceCsp is true for strict segments and their children, false for public pages, the homepage and unknown paths", () => {
    expect(usesStrictNonceCsp("/dashboard")).toBe(true);
    expect(usesStrictNonceCsp("/login/verify-2fa")).toBe(true);
    expect(usesStrictNonceCsp("/api/viewer")).toBe(true);
    expect(usesStrictNonceCsp("/report/abc123/detailed")).toBe(true);
    expect(usesStrictNonceCsp("/")).toBe(false);
    expect(usesStrictNonceCsp("/quote-checker")).toBe(false);
    expect(usesStrictNonceCsp("/cars/buying-guide")).toBe(false);
    expect(usesStrictNonceCsp("/guides/buying-a-used-car")).toBe(false);
    // The static 404 page: middleware sees the mistyped URL, not /_not-found.
    expect(usesStrictNonceCsp("/some-typo")).toBe(false);
  });
});
