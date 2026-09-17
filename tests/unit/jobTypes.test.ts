import { describe, expect, it } from "vitest";
import { isBenchmarkedJob, BENCHMARKED_JOB_TYPES, JOB_LABELS, JOB_GROUPS } from "@/lib/tracker/jobTypes";

describe("JOB_GROUPS completeness", () => {
  it("every JOB_LABELS key appears in exactly one JOB_GROUPS entry", () => {
    const allJobsInGroups = JOB_GROUPS.flatMap((g) => g.jobs);
    expect(new Set(allJobsInGroups).size).toBe(allJobsInGroups.length);
    expect(new Set(allJobsInGroups)).toEqual(new Set(Object.keys(JOB_LABELS)));
  });
});

describe("isBenchmarkedJob", () => {
  it("is true for every job type actually listed as benchmarked", () => {
    for (const job of BENCHMARKED_JOB_TYPES) {
      expect(isBenchmarkedJob(job)).toBe(true);
    }
  });

  it("is false for a job type with no real pricing benchmark", () => {
    expect(isBenchmarkedJob("valve-clearance")).toBe(false);
  });

  it("is false for a genuinely unrecognized string", () => {
    expect(isBenchmarkedJob("not-a-real-job-type")).toBe(false);
  });
});