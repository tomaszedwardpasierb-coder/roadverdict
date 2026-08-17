// Place at: src/lib/tracker/assistantQuestionLog.ts
//
// Logs the text of questions asked to the RoadVerdict assistant, along
// with who asked (when signed in) - product feedback about what
// people are actually trying to do, what's commonly asked, what's
// failing, and who to follow up with if a specific person keeps
// getting stuck. Uses a single fixed partition rather than each user's
// own (see cosmosHelpers.ts for that pattern) since these are read as
// one list across everyone, not queried per-user the way the rest of
// this container's documents are.
//
// This links a real identity (email) to what someone typed, which is
// personal data. It isn't described in the privacy policy yet -
// neither the live one nor the more comprehensive draft, both of which
// predate this file - and it needs to be before this is genuinely
// accurate. See the privacy-draft work elsewhere in this project for
// the pattern to follow when adding it.
import { getContainer } from "@/lib/cosmos";

const LOG_TYPE = "assistantQuestion";
const LOG_PARTITION_KEY = "assistant-question-log";

export interface AssistantQuestionLogDoc {
  id: string;
  pk: string;
  type: typeof LOG_TYPE;
  question: string;
  askedAt: string;
  signedIn: boolean;
  // Absent for anonymous visitors, since there's no identity to
  // record - never a placeholder string standing in for "unknown".
  email?: string;
  hadError: boolean;
}

// Caller awaits this (a Cosmos write is fast, and awaiting is the safe
// choice regardless of hosting model) but never lets a failure here
// affect the actual chat response - a logging problem should never be
// the reason someone doesn't get an answer.
export async function logAssistantQuestion(question: string, signedIn: boolean, hadError: boolean, email?: string): Promise<void> {
  try {
    const container = getContainer();
    const doc: AssistantQuestionLogDoc = {
      // Random suffix, not just a timestamp - two questions logged in
      // the same millisecond (realistic under any real concurrency)
      // would otherwise collide and silently overwrite each other.
      id: `${LOG_PARTITION_KEY}::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`,
      pk: LOG_PARTITION_KEY,
      type: LOG_TYPE,
      question: question.slice(0, 500),
      askedAt: new Date().toISOString(),
      signedIn,
      ...(email ? { email } : {}),
      hadError,
    };
    await container.items.upsert(doc);
  } catch (err) {
    console.error("Failed to log assistant question:", err);
  }
}

// Fetches every logged question - deliberately not paginated. A single
// Cosmos partition scaled for a solo-run product's realistic traffic
// stays small enough that this is simpler and more reliable than
// building pagination for a scale this doesn't have yet. Revisit if
// this partition ever genuinely grows large.
export async function getAllAssistantQuestions(): Promise<AssistantQuestionLogDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<AssistantQuestionLogDoc>(
      {
        query: "SELECT * FROM c WHERE c.type = @type ORDER BY c.askedAt DESC",
        parameters: [{ name: "@type", value: LOG_TYPE }],
      },
      { partitionKey: LOG_PARTITION_KEY }
    )
    .fetchAll();
  return resources;
}

// Groups near-identical questions together (lowercased, trimmed,
// trailing punctuation stripped) and counts them. This is a simple
// exact-match count on normalized text, NOT true semantic clustering -
// "when's my MOT due" and "MOT due date" will count as two different
// questions even though they mean the same thing. Good enough to spot
// genuinely repeated exact phrasing; real theme-level insight would
// need an actual summarization pass, not this.
export function groupSimilarQuestions(questions: AssistantQuestionLogDoc[], topN = 15): { text: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const q of questions) {
    const normalized = q.question.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?!.]+$/, "");
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

// For clearing out noise - test messages, junk, anything not worth
// keeping in the log. All docs here share the same fixed partition
// key (see LOG_PARTITION_KEY above), so this is a direct point-delete,
// not a query.
export async function deleteAssistantQuestion(id: string): Promise<void> {
  const container = getContainer();
  await container.item(id, LOG_PARTITION_KEY).delete();
}
