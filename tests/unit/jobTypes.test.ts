import { describe, expect, it } from "vitest";
import { isBenchmarkedJob, BENCHMARKED_JOB_TYPES } from "@/lib/tracker/jobTypes";

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