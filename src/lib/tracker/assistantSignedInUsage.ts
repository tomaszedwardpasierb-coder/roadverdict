// Place at: src/lib/tracker/assistantSignedInUsage.ts
//
// Per-account, per-day message ceiling for the AI assistant once signed
// in - previously truly unlimited (see assistantAnonUsage.ts's own
// comment, which explicitly says "no limit once logged in"). That was a
// real cost-exposure gap: every message can cost up to MAX_TOOL_ROUNDS+1
// Gemini calls, each one resending the assistant's full knowledge base
// (~65,000 characters) as part of the system instruction. Gemini's
// implicit context caching (2.5+ models) *may* discount that repeated
// prefix automatically, but that behaviour is documented as inconsistent
// once tool declarations are attached to the request (which every
// assistant call here does) - not something to rely on as an actual
// guarantee. This is a floor against runaway or scripted abuse, not a
// precisely-computed budget line - deliberately generous, since a
// genuinely engaged user asking dozens of real questions in a session is
// exactly what this feature is for.
//
// Calendar-day reset, same shape as assistantAnonUsage.ts's own
// AssistantAnonUsageDoc, but stored directly on UserDoc (a point-read by
// email) rather than a separate hashed-key doc, since a signed-in
// request already has a real account to key off - no need for the
// anon tracker's cookie+IP double-keying here.
import { getContainer } from "@/lib/cosmos";
import type { UserDoc } from "@/lib/tracker/userDoc";

export const ASSISTANT_SIGNED_IN_MESSAGE_LIMIT = 150;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function canSendAssistantMessage(user: UserDoc | null): boolean {
  if (!user?.assistantMessageUsage) return true;
  if (user.assistantMessageUsage.date !== todayUtc()) return true;
  return user.assistantMessageUsage.count < ASSISTANT_SIGNED_IN_MESSAGE_LIMIT;
}

export async function recordAssistantMessage(email: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(email, email).read<UserDoc>();
  if (!resource) return;
  const today = todayUtc();
  const currentCount = resource.assistantMessageUsage?.date === today ? resource.assistantMessageUsage.count : 0;
  resource.assistantMessageUsage = { date: today, count: currentCount + 1 };
  await container.items.upsert(resource);
}
