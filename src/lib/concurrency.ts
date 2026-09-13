// Place at: src/lib/concurrency.ts
//
// A plain Promise.all/allSettled fan-out sized to an entire list (e.g.
// "every registered user") scales its concurrent Cosmos write count with
// however large that list has grown to - fine at a few dozen users, a
// real risk of RU throttling (or just an unusually long-held HTTP
// request) once it's a few thousand. This runs the same per-item work in
// fixed-size chunks instead, still concurrent within each chunk, but
// never more than `chunkSize` requests in flight at once.
export async function runInBatches<T, R>(
  items: T[],
  chunkSize: number,
  worker: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.allSettled(chunk.map(worker));
    results.push(...chunkResults);
  }
  return results;
}
