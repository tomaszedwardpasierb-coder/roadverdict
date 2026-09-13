import { describe, expect, it, vi } from "vitest";
import { runInBatches } from "@/lib/concurrency";

describe("runInBatches", () => {
  it("processes every item and returns results in the original order", async () => {
    const results = await runInBatches([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([10, 20, 30, 40, 50]);
  });

  it("never has more than chunkSize workers in flight at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const worker = async (n: number) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return n;
    };

    await runInBatches([1, 2, 3, 4, 5, 6, 7], 3, worker);

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("isolates a rejected item - the rest of its own chunk and later chunks still run", async () => {
    const worker = vi.fn(async (n: number) => {
      if (n === 2) throw new Error("boom");
      return n;
    });

    const results = await runInBatches([1, 2, 3, 4], 2, worker);

    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(results[1].status).toBe("rejected");
    expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
    expect(results[3]).toEqual({ status: "fulfilled", value: 4 });
    expect(worker).toHaveBeenCalledTimes(4);
  });

  it("returns an empty array for an empty input, without calling the worker", async () => {
    const worker = vi.fn();
    await expect(runInBatches([], 5, worker)).resolves.toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });
});
