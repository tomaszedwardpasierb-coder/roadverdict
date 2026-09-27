// Place at: tests/unit/affiliates.test.ts
//
// The Sportsbikeshop link rules from lib/affiliates.ts: the link builder's
// exact format, at most two links per line, and only real motorcycle job
// types mapped to parts.
import { describe, expect, it } from "vitest";

import {
  SPORTSBIKESHOP_AFFILIATE_ID,
  SPORTSBIKESHOP_FOR_JOB,
  SPORTSBIKESHOP_SOURCE,
  sportsbikeshopLinks,
  sportsbikeshopLinksForJob,
} from "@/lib/affiliates";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";

describe("Sportsbikeshop affiliate links", () => {
  it("builds the link builder's format: the page + #/<affiliate id>,<source>,<campaign>", () => {
    const [pads] = sportsbikeshopLinks(["brake-pads"], "tracker");
    expect(pads).toEqual({
      label: "Brake pads",
      href: `https://www.sportsbikeshop.co.uk/motorcycle_parts/content_cat/763#/${SPORTSBIKESHOP_AFFILIATE_ID},${SPORTSBIKESHOP_SOURCE.tracker},0`,
    });
  });

  it("only ever links to sportsbikeshop.co.uk over https, with our affiliate id", () => {
    const categories = [...new Set(Object.values(SPORTSBIKESHOP_FOR_JOB).flat())];
    const extras = ["disc-locks", "security-chains", "helmets", "jackets"] as const;
    for (const category of [...categories, ...extras]) {
      const [link] = sportsbikeshopLinks([category], "guides");
      const url = new URL(link.href);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("www.sportsbikeshop.co.uk");
      expect(url.hash).toBe(`#/${SPORTSBIKESHOP_AFFILIATE_ID},${SPORTSBIKESHOP_SOURCE.guides},0`);
    }
  });

  it("never puts more than two links on one line", () => {
    expect(sportsbikeshopLinks(["helmets", "jackets", "tyres"], "guides")).toHaveLength(2);
  });

  it("maps only real motorcycle job types", () => {
    for (const job of Object.keys(SPORTSBIKESHOP_FOR_JOB)) {
      expect(Object.keys(JOB_LABELS)).toContain(job);
    }
  });

  it("gives no links for jobs with nothing to buy, or no job at all", () => {
    for (const job of ["valve-clearance", "coolant-flush", "brake-fluid-flush", "valet", "wash", "other", "mot"]) {
      expect(sportsbikeshopLinksForJob(job, "tracker")).toEqual([]);
    }
    expect(sportsbikeshopLinksForJob(undefined, "quoteChecker")).toEqual([]);
    expect(sportsbikeshopLinksForJob(null, "quoteChecker")).toEqual([]);
  });
});
