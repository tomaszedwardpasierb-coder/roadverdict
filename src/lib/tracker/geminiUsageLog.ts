// Place at: src/lib/tracker/geminiUsageLog.ts
//
// Records every real Gemini API call this app makes, tagged by which
// task it was for - what /tomasz's "Gemini API usage" section reads to
// show call volume broken down by task. A fixed partition (this app's
// current Gemini volume is nowhere near large enough to need sharding
// by date or task), with a TTL so the log doesn't grow forever.
//
// Fire-and-forget, wrapped in try/catch that never throws - the same
// convention as logAssistantQuestion (assistantQuestionLog.ts): a
// logging failure must never be the reason a real Gemini call (or its
// caller) fails.
import { getContainer } from "@/lib/cosmos";

const PARTITION_KEY = "geminiUsageLog";
const TTL_SECONDS = 90 * 24 * 60 * 60;

export interface GeminiUsageLogDoc {
  id: string;
  pk: typeof PARTITION_KEY;
  type: typeof PARTITION_KEY;
  task: string;
  model: string;
  success: boolean;
  createdAt: string;
  ttl: number;
}

export async function logGeminiUsage(task: string, model: string, success: boolean): Promise<void> {
  try {
    const container = getContainer();
    const doc: GeminiUsageLogDoc = {
      id: `${PARTITION_KEY}::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`,
      pk: PARTITION_KEY,
      type: PARTITION_KEY,
      task,
      model,
      success,
      createdAt: new Date().toISOString(),
      ttl: TTL_SECONDS,
    };
    await container.items.upsert(doc);
  } catch (err) {
    console.error("Failed to log Gemini usage:", err);
  }
}

export interface GeminiUsageByTask {
  task: string;
  count: number;
}

// Cosmos NoSQL supports GROUP BY directly (already used elsewhere in
// this app - see admin/stats.ts's getMagicLinkRequests), so per-task
// totals come straight from one query rather than fetching every log
// row and counting client-side.
export async function getGeminiUsageByTask(): Promise<GeminiUsageByTask[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<GeminiUsageByTask>(
      {
        query: "SELECT c.task, COUNT(1) as count FROM c WHERE c.type = @type GROUP BY c.task",
        parameters: [{ name: "@type", value: PARTITION_KEY }],
      },
      { partitionKey: PARTITION_KEY }
    )
    .fetchAll();
  return resources.sort((a, b) => b.count - a.count);
}
