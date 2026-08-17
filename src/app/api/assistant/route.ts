// Place at: src/app/api/assistant/route.ts
//
// Available to signed-in and anonymous visitors alike - the knowledge
// base covers plenty a prospective user would want answered before
// creating an account. Personal-data tools (assistantTools.ts) are only
// ever offered to the model when a real session exists, and every tool
// call is scoped to that session's own email - never anything supplied
// by the request body or the model itself. See knowledge base section 5
// for the full reasoning behind that boundary.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { ASSISTANT_KNOWLEDGE_BASE, getLivePrivacyPolicyText } from "@/lib/tracker/assistantKnowledge";
import { ASSISTANT_TOOL_DECLARATIONS, runAssistantTool } from "@/lib/tracker/assistantTools";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-3.5-flash-lite"; // same model storyProse.ts already uses
const MAX_MESSAGES = 20; // conversation-length guard, not a hard product limit
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOOL_ROUNDS = 4; // safety cap against a runaway tool-call loop

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Covers all three part shapes the Gemini API actually uses across a
// tool-calling round trip - typing this properly up front avoids the
// unsafe casts that would otherwise creep in further down.
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

function buildSystemInstruction(signedIn: boolean, privacyPolicyText: string | null): string {
  const parts = [ASSISTANT_KNOWLEDGE_BASE];

  parts.push(
    signedIn
      ? "\n\n---\n\nCURRENT SESSION: a real, signed-in user is asking. The tools described in section 5 of the document above are available to you now - use them for any question about their own logged data rather than guessing or asking them to look it up themselves. Never ask the user for an account identifier, email, or bike ID to look something up - you already have everything you need through the tools; asking for it would be both unnecessary and a sign something's gone wrong."
      : "\n\n---\n\nCURRENT SESSION: nobody is signed in right now. The personal-data tools in section 5 are not available for this conversation. If asked about their own spend, mileage, or similar, say plainly that you'd need them signed in to look that up - don't guess, and don't claim to check something you have no way to check right now."
  );

  parts.push(
    privacyPolicyText
      ? `\n\n---\n\nLIVE PRIVACY POLICY (current text, fetched just now - use this directly for any data-handling or privacy question per section 8.3 of the document above, never your own reasoning):\n\n${privacyPolicyText}`
      : "\n\n---\n\nThe live Privacy Policy could not be fetched for this conversation. For any data-handling or privacy question, say you're not able to pull up the policy's exact wording right now and point to roadverdict.co.uk/privacy directly, rather than answering from general reasoning."
  );

  return parts.join("");
}

// Gemini's REST API expects role: "user" | "model", not "assistant" -
// this is the one place that mapping happens.
function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Assistant is not configured." }, { status: 503 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const messages = (body.messages ?? []).slice(-MAX_MESSAGES);
  if (messages.length === 0) {
    return NextResponse.json({ error: "No message provided." }, { status: 400 });
  }
  for (const m of messages) {
    if (typeof m.content !== "string" || m.content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "Message too long." }, { status: 400 });
    }
  }

  // If this throws for any reason - Cosmos genuinely unavailable, not
  // just a missing local env var - fail closed rather than crash: treat
  // the request as anonymous. That's also the safer direction to fail
  // in, not just the more resilient one - no session confirmed means no
  // personal-data tools get attached below, same as a real signed-out
  // visitor.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error("Assistant: getSession() failed, continuing as anonymous:", err);
  }
  const signedIn = !!session;

  const privacyPolicyText = await getLivePrivacyPolicyText();
  const systemInstruction = buildSystemInstruction(signedIn, privacyPolicyText);

  const contents: GeminiContent[] = toGeminiContents(messages);
  const tools = signedIn ? [{ functionDeclarations: ASSISTANT_TOOL_DECLARATIONS }] : undefined;

  try {
    // Bounded rather than while(true) - a tool-call loop that somehow
    // never terminates should fail loudly with a real response, not
    // hang the request indefinitely.
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          ...(tools ? { tools } : {}),
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "(could not read response body)");
        console.error(`Assistant: Gemini API returned ${res.status} ${res.statusText}:`, errBody);
        return NextResponse.json({ error: "Assistant is temporarily unavailable." }, { status: 502 });
      }

      const data = await res.json();
      const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
      const functionCallPart = parts.find((p) => p.functionCall);

      if (functionCallPart?.functionCall && session && round < MAX_TOOL_ROUNDS) {
        const { name, args } = functionCallPart.functionCall;
        // session.email only - never anything from `args`, which is
        // model-supplied and therefore untrusted for identity purposes.
        const toolResult = await runAssistantTool(name, args ?? {}, session.email);

        // Echo the model's own function-call turn back, then supply the
        // result - Gemini's expected shape for a tool-use round trip.
        contents.push({ role: "model", parts: [{ functionCall: { name, args } }] });
        contents.push({ role: "user", parts: [{ functionResponse: { name, response: toolResult } }] });
        continue;
      }

      const replyText = parts.find((p) => typeof p.text === "string")?.text;
      if (!replyText) {
        console.error("Assistant: Gemini response had no text part. Full parts:", JSON.stringify(parts));
        return NextResponse.json({ error: "Assistant is temporarily unavailable." }, { status: 502 });
      }
      return NextResponse.json({ reply: replyText });
    }

    return NextResponse.json({ error: "Assistant took too many steps to answer that - try rephrasing." }, { status: 502 });
  } catch (err) {
    console.error("Assistant: unhandled error:", err);
    return NextResponse.json({ error: "Assistant is temporarily unavailable." }, { status: 502 });
  }
}
