// Place at: src/lib/admin/cronRuns.ts
//
// "Last run" for every scheduled job, shown on /tomasz. Each scheduled
// route's POST is wrapped in withCronRun, which records when it last ran
// and whether it worked - one small document per job. Recording can never
// break a job: any failure to write is swallowed, and a request turned
// away for a wrong cron secret (401) isn't recorded at all.
import type { NextRequest } from "next/server";
import { getContainer } from "@/lib/cosmos";

const PK = "system";

export type CronRunDoc = { id: string; pk: string; type: "cronRun"; name: string; lastRunAt: string; ok: boolean; status: number };

export async function recordCronRun(name: string, status: number): Promise<void> {
  try {
    const doc: CronRunDoc = { id: `cronRun::${name}`, pk: PK, type: "cronRun", name, lastRunAt: new Date().toISOString(), ok: status < 400, status };
    await getContainer().items.upsert(doc);
  } catch {
    // Never let bookkeeping fail a job.
  }
}

export function withCronRun<R extends Request = NextRequest>(name: string, handler: (req: R) => Promise<Response>): (req: R) => Promise<Response> {
  return async (req: R) => {
    const res = await handler(req);
    if (res.status !== 401) await recordCronRun(name, res.status);
    return res;
  };
}

export async function getCronRuns(): Promise<Record<string, CronRunDoc>> {
  try {
    const { resources } = await getContainer()
      .items.query<CronRunDoc>({ query: "SELECT * FROM c WHERE c.type = 'cronRun'" }, { partitionKey: PK })
      .fetchAll();
    return Object.fromEntries(resources.map((r) => [r.name, r]));
  } catch {
    return {};
  }
}
