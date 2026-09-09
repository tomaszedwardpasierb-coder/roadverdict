import { describe, expect, it } from "vitest";
import { CAR_JOB_LABELS, CAR_JOB_GROUPS } from "@/lib/tracker/carJobTypes";

describe("CAR_JOB_GROUPS completeness", () => {
  it("every CAR_JOB_LABELS key appears in exactly one CAR_JOB_GROUPS entry", () => {
    const allJobsInGroups = CAR_JOB_GROUPS.flatMap((g) => g.jobs);
    expect(new Set(allJobsInGroups).size).toBe(allJobsInGroups.length); // no duplicates across groups
    expect(new Set(allJobsInGroups)).toEqual(new Set(Object.keys(CAR_JOB_LABELS)));
  });
});
