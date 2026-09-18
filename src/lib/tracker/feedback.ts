// Place at: src/lib/tracker/feedback.ts
//
// Feature requests and bug reports, raised either through the manual
// "Feature request / report a bug" form (SettingsTab.tsx) or by the AI
// assistant on the user's behalf (see assistantTools.ts's
// toolProposeFeedback). Single fixed partition, not each user's own -
// same reasoning as assistantQuestionLog.ts: this is read back as one
// admin list across everyone, not queried per-user the way the rest of
// this container's documents are.
//
// Unlike assistantQuestionLog.ts's own "never let a logging failure
// affect the real response" stance, this file's write IS the primary
// action, not best-effort telemetry - /api/account/feedback/route.ts
// treats a failure here as a real error, with the email notification
// (sendFeedbackEmail) as the best-effort courtesy on top, not the other
// way around.
import { getContainer } from "@/lib/cosmos";
import type { Attachment } from "./cosmosHelpers";

const FEEDBACK_TYPE = "feedback";
const FEEDBACK_PARTITION_KEY = "feedback-log";

export type FeedbackKind = "feature" | "bug" | "other";
export type FeedbackStatus = "new" | "reviewed" | "resolved";

export interface FeedbackDoc {
  id: string;
  pk: string;
  type: typeof FEEDBACK_TYPE;
  feedbackType: FeedbackKind;
  message: string;
  email: string;
  submittedAt: string;
  status: FeedbackStatus;
  // Bug reports only, up to 3, PNG/JPG only - see the dedicated
  // /api/account/feedback/upload-attachment route, kept deliberately
  // separate from the tracker's own receipt-attachment mechanism.
  attachments?: Attachment[];
  // Which surface it was raised from - purely informational, shown in
  // the admin view, never used to gate anything.
  source: "settings" | "assistant";
}

export async function createFeedback(
  email: string,
  feedbackType: FeedbackKind,
  message: string,
  attachments: Attachment[] | undefined,
  source: "settings" | "assistant"
): Promise<FeedbackDoc> {
  const container = getContainer();
  const doc: FeedbackDoc = {
    // Random suffix, not just a timestamp - two submissions in the same
    // millisecond (realistic under any real concurrency) would otherwise
    // collide and silently overwrite each other.
    id: `${FEEDBACK_PARTITION_KEY}::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`,
    pk: FEEDBACK_PARTITION_KEY,
    type: FEEDBACK_TYPE,
    feedbackType,
    message,
    email,
    submittedAt: new Date().toISOString(),
    status: "new",
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    source,
  };
  await container.items.create(doc);
  return doc;
}

// Deliberately not paginated - same reasoning as
// getAllAssistantQuestions's own comment: a single Cosmos partition
// scaled for a solo-run product's realistic traffic stays small enough
// that this is simpler and more reliable than building pagination for a
// scale this doesn't have yet.
export async function getAllFeedback(): Promise<FeedbackDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<FeedbackDoc>(
      {
        query: "SELECT * FROM c WHERE c.type = @type ORDER BY c.submittedAt DESC",
        parameters: [{ name: "@type", value: FEEDBACK_TYPE }],
      },
      { partitionKey: FEEDBACK_PARTITION_KEY }
    )
    .fetchAll();
  return resources;
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(id, FEEDBACK_PARTITION_KEY).read<FeedbackDoc>();
  if (!resource) throw new Error(`Feedback item ${id} not found.`);
  await container.item(id, FEEDBACK_PARTITION_KEY).replace({ ...resource, status });
}
