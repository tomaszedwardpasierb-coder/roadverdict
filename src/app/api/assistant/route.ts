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
import { getLivePrivacyPolicyText } from "@/lib/tracker/assistantKnowledge";
import { getAssistantConfig, type AssistantConfigDoc } from "@/lib/tracker/assistantConfig";
import {
  ASSISTANT_TOOL_DECLARATIONS,
  REPORT_TOOL_DECLARATIONS,
  COMPARISON_TOOL_DECLARATIONS,
  runAssistantTool,
  type CompareContext,
} from "@/lib/tracker/assistantTools";
import { logAssistantQuestion } from "@/lib/tracker/assistantQuestionLog";
import { logGeminiUsage } from "@/lib/tracker/geminiUsageLog";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { getBikesForUser, isBikeReadOnly } from "@/lib/tracker/bike";
import { isPro } from "@/lib/subscriptions";
import { MIN_COMPARE_BIKES, MAX_COMPARE_BIKES } from "@/lib/tracker/bikeComparison";

export const dynamic = "force-dynamic";

// Reverted to the exact model already proven live in production - the
// per-task tier split from AI-Models-for-Different-Tasks.docx broke real
// usage on deploy: gemini-2.5-* is on Google's deprecation path (some
// accounts reportedly losing access even ahead of its official October
// 2026 shutdown). See receiptParse.ts's GEMINI_MODEL comment.
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const MAX_MESSAGES = 20; // conversation-length guard, not a hard product limit
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOOL_ROUNDS = 4; // safety cap against a runaway tool-call loop

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Covers all shapes the Gemini API actually uses across a tool-calling
// round trip - typing this properly up front avoids the unsafe casts
// that would otherwise creep in further down. thoughtSignature is an
// opaque token "thinking" models like gemini-3.5-flash-lite attach to
// a function-call part - it must be echoed back unchanged on the
// follow-up turn, or the API rejects the request with a 400. See
// https://ai.google.dev/gemini-api/docs/thought-signatures
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
  thoughtSignature?: string;
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

// Server-owned labels for every dashboard tab, keyed by the same
// Section values DashboardShell.tsx's own NAV_ITEMS uses. The client
// only ever sends the KEY (e.g. "shareLinks"), never a label - this map
// is what turns that into text that actually reaches the model's
// system prompt, so a request can never inject arbitrary text there by
// sending something unexpected as dashboardTab. Anything not a key
// here is treated as no tab open at all (see the route handler below).
const DASHBOARD_TAB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  service: "Service",
  fuel: "Fuel",
  mods: "Parts & Accessories",
  bills: "Insurance, Tax, MOT & Finance",
  reminders: "Reminders",
  reports: "Reports",
  story: "The Story So Far",
  shareLinks: "Shareable Links",
  quoteChecker: "Quote Checker",
  costCalculator: "Cost calculator",
  buyingGuide: "Buying a used bike",
  privacy: "Privacy",
  transferOwnership: "Transfer ownership",
};

function buildSystemInstruction(config: AssistantConfigDoc, signedIn: boolean, privacyPolicyText: string | null, reportOpen: boolean, dashboardTabLabel: string | null, compareBikeNames: string[] | null): string {
  const parts = [config.knowledgeBase];

  // Appended right after the knowledge base, before the more
  // operational blocks below - both this and the knowledge base are
  // admin-authored content, kept together as one block, rather than
  // mixed in with the technical instructions about tools and data
  // sources that follow. Skipped entirely if personality is off, or
  // on but the selected slot was never actually written - an empty
  // block adds nothing but noise.
  if (config.personalityEnabled && config.activePersonalityId) {
    const active = config.personalities.find((p) => p.id === config.activePersonalityId);
    if (active && active.body.trim()) {
      parts.push(
        `\n\n---\n\nPERSONALITY (how to sound, not what to know - every rule in the document above still applies exactly as written, this only shapes tone):\n\n${active.body}`
      );
    }
  }

  parts.push(
    signedIn
      ? "\n\n---\n\nCURRENT SESSION: a real, signed-in user is asking. The tools described in section 5 of the document above are available to you now - use them for any question about their own logged data rather than guessing or asking them to look it up themselves. Never ask the user for an account identifier, email, or bike ID to look something up - you already have everything you need through the tools; asking for it would be both unnecessary and a sign something's gone wrong."
      : "\n\n---\n\nCURRENT SESSION: nobody is signed in right now. The personal-data tools in section 5 are not available for this conversation. If asked about their own spend, mileage, or similar, say plainly that you'd need them signed in to look that up - don't guess, and don't claim to check something you have no way to check right now."
  );

  if (reportOpen) {
    parts.push(
      "\n\n---\n\nCURRENT PAGE: the visitor currently has a specific shared report open - either their own bike's, or one someone else generated to show a bike's logged history to a potential buyer. The getViewedReport tool is available now. Call it BEFORE answering any question that could plausibly be about this bike, even a vague, pronoun-only, or purchase-decision question with no explicit mention of 'this report' or 'this bike' - e.g. 'should I buy it?', 'what do you think?', 'is it worth it?', 'I don't understand it'. While a report is open, 'it'/'this'/an unqualified purchase question defaults to being about THIS bike, not a generic one - never fall back to generic buying advice without checking the tool first just because the question didn't use those exact words. This report may belong to a completely different account than whoever is signed in, if anyone - never conflate the two. Never use the signed-in user's own personal-data tools to answer a question about this report, and never use getViewedReport to answer a question about the signed-in user's own account in general."
    );
  }

  if (dashboardTabLabel) {
    parts.push(
      `\n\n---\n\nCURRENT DASHBOARD TAB: the signed-in user currently has the "${dashboardTabLabel}" tab open on their dashboard. If they ask a vague, pronoun-only, or unqualified question about what something is or does - e.g. "what's this for?", "what's that?", "not sure what this does" - with no other clearer subject in the conversation, assume they mean the "${dashboardTabLabel}" tab specifically, using the document above's own description of that feature. Answer in ONE short, plain paragraph - what it's for, nothing more - then ask a brief follow-up like "want me to go into more detail?" rather than immediately explaining everything about it. Only go deeper than that first short answer if they actually say yes to that follow-up (or ask a specific follow-up question) - don't front-load the full explanation before they've asked for it.`
    );
  }

  if (compareBikeNames) {
    parts.push(
      `\n\n---\n\nCURRENT PAGE: the signed-in user has the Compare bikes page open, currently comparing: ${compareBikeNames.join(", ")}. The getViewedComparison tool is available now. Call it BEFORE answering any question that could plausibly be about this comparison, even a vague, pronoun-only, or unqualified question with no explicit mention of "this comparison" - e.g. "which is cheaper?", "what does this show?", "is that right?". While this page is open, an unqualified question about "these bikes" or "which one" defaults to being about THIS specific comparison, not a generic account-wide question - never fall back to a different personal-data tool without checking this one first just because the question didn't use those exact words.`
    );
  }

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

  let body: { messages?: ChatMessage[]; reportToken?: string; dashboardTab?: string; compareBikeIds?: string[]; compareFrom?: string; compareTo?: string };
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

  // Only ever trusted after both checks below pass - a token that
  // merely exists isn't enough, since that would let the assistant
  // answer about a report the visitor hasn't actually unlocked yet
  // (e.g. a guessed or leaked token with no plate-gate pass behind it).
  // hasReportAccess() is the exact same cookie-backed check the report
  // pages themselves use to decide whether to render at all.
  let reportToken: string | null = null;
  const rawReportToken = typeof body.reportToken === "string" ? body.reportToken.trim() : "";
  if (rawReportToken) {
    try {
      const resolved = await resolveShareToken(rawReportToken);
      if (resolved && (await hasReportAccess(rawReportToken))) {
        reportToken = rawReportToken;
      }
    } catch (err) {
      console.error("Assistant: report token validation failed, continuing without it:", err);
    }
  }

  // Only meaningful while signed in - the dashboard itself requires a
  // session, so a tab claim on an anonymous request is never trusted.
  // Looked up against DASHBOARD_TAB_LABELS rather than used directly,
  // same reasoning as reportToken above: the client sends a bare key,
  // never free text, so nothing it sends can inject arbitrary content
  // into the system prompt below.
  const dashboardTabLabel =
    signedIn && typeof body.dashboardTab === "string" ? DASHBOARD_TAB_LABELS[body.dashboardTab] ?? null : null;

  // Only ever trusted after being cross-checked against this session's
  // own real bikes and Pro status below - the client sends raw ids read
  // straight from its own URL, which is just a hint about what's on
  // screen, never enough on its own to decide what the assistant can
  // see (same reasoning as reportToken above). Silently ends up null
  // (no tool offered) for anything that doesn't check out, rather than
  // erroring the whole request over a stale or tampered hint.
  let compareContext: CompareContext | null = null;
  let compareBikeNames: string[] | null = null;
  if (signedIn && session && Array.isArray(body.compareBikeIds) && body.compareBikeIds.length > 0) {
    try {
      const userIsPro = await isPro(session.email);
      if (userIsPro) {
        const bikes = await getBikesForUser(session.email);
        const ownActiveBikes = bikes.filter((b) => !isBikeReadOnly(b));
        const requestedIds = body.compareBikeIds.filter((id): id is string => typeof id === "string");
        const matched = requestedIds
          .map((id) => ownActiveBikes.find((b) => b.id === id))
          .filter((b): b is NonNullable<typeof b> => !!b);
        if (matched.length >= MIN_COMPARE_BIKES && matched.length <= MAX_COMPARE_BIKES) {
          const from = typeof body.compareFrom === "string" && body.compareFrom ? body.compareFrom : undefined;
          const to = typeof body.compareTo === "string" && body.compareTo ? body.compareTo : undefined;
          compareContext = { bikeIds: matched.map((b) => b.id), from, to };
          compareBikeNames = matched.map((b) => (b.nickname ? `${b.nickname} (${b.make} ${b.model})` : `${b.make} ${b.model}`));
        }
      }
    } catch (err) {
      console.error("Assistant: compare-context validation failed, continuing without it:", err);
    }
  }

  // The client always appends the new message before sending, so this
  // is the actual question being asked right now - not the full
  // history, which would have already been logged on earlier requests.
  const question = messages[messages.length - 1]?.content ?? "";

  const [config, privacyPolicyText] = await Promise.all([getAssistantConfig(), getLivePrivacyPolicyText()]);

  // Deliberately not a silent fallback to some hardcoded copy - a
  // second, driftable source is exactly the failure this migration
  // exists to remove. If the live config can't be read, the assistant
  // is genuinely unavailable, the same as a Gemini API failure below,
  // not quietly running on stale content nobody chose.
  if (!config) {
    console.error("Assistant: getAssistantConfig() returned null - config document missing or unreadable.");
    await logAssistantQuestion(question, signedIn, true, session?.email);
    return NextResponse.json({ error: "Assistant is temporarily unavailable." }, { status: 503 });
  }

  const systemInstruction = buildSystemInstruction(config, signedIn, privacyPolicyText, !!reportToken, dashboardTabLabel, compareBikeNames);

  const contents: GeminiContent[] = toGeminiContents(messages);
  const toolDeclarations = [
    ...(signedIn ? ASSISTANT_TOOL_DECLARATIONS : []),
    ...(reportToken ? REPORT_TOOL_DECLARATIONS : []),
    ...(compareContext ? COMPARISON_TOOL_DECLARATIONS : []),
  ];
  const tools = toolDeclarations.length > 0 ? [{ functionDeclarations: toolDeclarations }] : undefined;

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
        await logGeminiUsage("assistant", GEMINI_MODEL, false);
        await logAssistantQuestion(question, signedIn, true, session?.email);
        return NextResponse.json({ error: "Assistant is temporarily unavailable." }, { status: 502 });
      }
      await logGeminiUsage("assistant", GEMINI_MODEL, true);

      const data = await res.json();
      const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
      const functionCallPart = parts.find((p) => p.functionCall);

      if (functionCallPart?.functionCall && (session || reportToken) && round < MAX_TOOL_ROUNDS) {
        const { name, args } = functionCallPart.functionCall;
        // session.email only - never anything from `args`, which is
        // model-supplied and therefore untrusted for identity purposes.
        // reportToken is this same request's own server-validated value
        // from above, for the same reason.
        const toolResult = await runAssistantTool(name, args ?? {}, session?.email ?? "", reportToken ?? undefined, compareContext ?? undefined);

        // Echo back every part from the model's actual turn, verbatim -
        // not a rebuilt {functionCall: {name, args}}, which silently
        // dropped thoughtSignature and any other part (e.g. accompanying
        // text) the model may have included alongside the function call.
        contents.push({ role: "model", parts });
        contents.push({ role: "user", parts: [{ functionResponse: { name, response: toolResult } }] });
        continue;
      }

      const replyText = parts.find((p) => typeof p.text === "string")?.text;
      if (!replyText) {
        console.error("Assistant: Gemini response had no text part. Full parts:", JSON.stringify(parts));
        await logAssistantQuestion(question, signedIn, true, session?.email);
        return NextResponse.json({ error: "Assistant is temporarily unavailable." }, { status: 502 });
      }
      await logAssistantQuestion(question, signedIn, false, session?.email);
      return NextResponse.json({ reply: replyText });
    }

    await logAssistantQuestion(question, signedIn, true, session?.email);
    return NextResponse.json({ error: "Assistant took too many steps to answer that - try rephrasing." }, { status: 502 });
  } catch (err) {
    console.error("Assistant: unhandled error:", err);
    await logAssistantQuestion(question, signedIn, true, session?.email);
    return NextResponse.json({ error: "Assistant is temporarily unavailable." }, { status: 502 });
  }
}
