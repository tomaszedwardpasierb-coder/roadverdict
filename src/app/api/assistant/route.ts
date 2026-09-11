// Place at: src/app/api/assistant/route.ts
//
// Available to signed-in and anonymous visitors alike - the knowledge
// base covers plenty a prospective user would want answered before
// creating an account. Personal-data tools (assistantTools.ts) are only
// ever offered to the model when a real session exists, and every tool
// call is scoped to that session's own email - never anything supplied
// by the request body or the model itself. See knowledge base section 5
// for the full reasoning behind that boundary.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canSendAnonAssistantMessage,
  generateAnonId,
  ANON_ID_COOKIE,
  ANON_ID_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/tracker/assistantAnonUsage";
import { getLivePrivacyPolicyText } from "@/lib/tracker/assistantKnowledge";
import { getAssistantConfig, getCarAssistantConfig, type AssistantConfigDoc } from "@/lib/tracker/assistantConfig";
import { resolveActiveVehicle } from "@/lib/tracker/activeVehicle";
import { getUserDoc } from "@/lib/tracker/userDoc";
import {
  ASSISTANT_TOOL_DECLARATIONS,
  REPORT_TOOL_DECLARATIONS,
  COMPARISON_TOOL_DECLARATIONS,
  buildLogEntryToolDeclarations,
  runAssistantTool,
  type CompareContext,
  type ProposedEntry,
} from "@/lib/tracker/assistantTools";
import { logAssistantQuestion } from "@/lib/tracker/assistantQuestionLog";
import { logGeminiUsage } from "@/lib/tracker/geminiUsageLog";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { getBikesForUser, isBikeReadOnly } from "@/lib/tracker/bike";
import { getCarsForUser, isCarReadOnly } from "@/lib/tracker/car";
import { isPro } from "@/lib/subscriptions";
import { MIN_COMPARE_VEHICLES, MAX_COMPARE_VEHICLES } from "@/lib/tracker/vehicleComparison";

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
  labour: "Labour",
  reminders: "Reminders",
  reports: "Reports",
  story: "The Story So Far",
  shareLinks: "Shareable Links",
  quoteChecker: "Quote Checker",
  costCalculator: "Cost calculator",
  buyingGuide: "Buying a used bike",
  privacy: "Privacy",
  transferOwnership: "Transfer ownership",
  security: "Settings",
};

// Which of the four collapsible sidebar groups (see DashboardShell.tsx's
// NAV_GROUPS) each tab lives in - kept in sync by hand, same as
// DASHBOARD_TAB_LABELS above. A key absent here (dashboard, reminders,
// security, privacy) means that tab is standalone, not inside any group.
// Lets the "CURRENT DASHBOARD TAB" block below name the group a tab is
// in, so "why is this here" / "where do I find X" stay accurate even as
// the knowledge base's own prose ages.
const TAB_GROUP_LABELS: Record<string, string> = {
  service: "Logbook",
  fuel: "Logbook",
  mods: "Logbook",
  bills: "Logbook",
  labour: "Logbook",
  reports: "Insights",
  story: "Insights",
  shareLinks: "Selling",
  transferOwnership: "Selling",
  quoteChecker: "Buying Tools",
  costCalculator: "Buying Tools",
  buyingGuide: "Buying Tools",
};

const NO_CAR_KB_FALLBACK =
  "No car-specific knowledge base has been written yet for RoadVerdict's car support. Be honest that detailed car guidance isn't set up yet rather than guessing, and never use motorcycle-specific facts, terminology, or figures as if they applied to a car.";

function buildSystemInstruction(config: AssistantConfigDoc, signedIn: boolean, privacyPolicyText: string | null, reportOpen: boolean, dashboardTabLabel: string | null, dashboardTabGroupLabel: string | null, compareVehicleNames: string[] | null, logEntryAccess: "available" | "upsell" | "none", activeVehicleKind: "bike" | "car" | null, displayName: string | null, carKnowledgeBase?: string): string {
  // A car-active session's knowledge base is a completely separate
  // document (see the ADR: one shared assistant, two knowledge bases) -
  // swapped in here instead of config.knowledgeBase (motorcycle-only)
  // whenever carKnowledgeBase is set, so a car-active session is never
  // handed motorcycle content, and vice versa. config itself is still
  // needed below for the personality settings, which are shared/global
  // rather than per-vehicle-kind.
  const parts = [carKnowledgeBase ?? config.knowledgeBase];

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

  // Set from the Settings tab's own profile section (SettingsTab.tsx) -
  // never trust anything about who's asking beyond this one string; it
  // only ever shapes how they're addressed, not what the assistant does
  // or doesn't check for them.
  if (signedIn && displayName) {
    parts.push(
      `\n\n---\n\nUSER'S NAME: this signed-in user has told RoadVerdict their name is "${displayName}" - address them by it naturally where it reads well (e.g. a greeting), don't force it into every single reply.`
    );
  }

  if (reportOpen) {
    parts.push(
      "\n\n---\n\nCURRENT PAGE: the visitor currently has a specific shared report open - either their own bike's, or one someone else generated to show a bike's logged history to a potential buyer. The getViewedReport tool is available now. Call it BEFORE answering any question that could plausibly be about this bike, even a vague, pronoun-only, or purchase-decision question with no explicit mention of 'this report' or 'this bike' - e.g. 'should I buy it?', 'what do you think?', 'is it worth it?', 'I don't understand it'. While a report is open, 'it'/'this'/an unqualified purchase question defaults to being about THIS bike, not a generic one - never fall back to generic buying advice without checking the tool first just because the question didn't use those exact words. This report may belong to a completely different account than whoever is signed in, if anyone - never conflate the two. Never use the signed-in user's own personal-data tools to answer a question about this report, and never use getViewedReport to answer a question about the signed-in user's own account in general."
    );
  }

  if (dashboardTabLabel) {
    const groupNote = dashboardTabGroupLabel
      ? ` This tab lives inside the "${dashboardTabGroupLabel}" group in the sidebar/bottom nav - if they ask why it's grouped there, or where to find it, answer from the document above's own description of the dashboard's layout rather than guessing.`
      : "";
    parts.push(
      `\n\n---\n\nCURRENT DASHBOARD TAB: the signed-in user currently has the "${dashboardTabLabel}" tab open on their dashboard.${groupNote} If they ask a vague, pronoun-only, or unqualified question about what something is or does - e.g. "what's this for?", "what's that?", "not sure what this does" - with no other clearer subject in the conversation, assume they mean the "${dashboardTabLabel}" tab specifically, using the document above's own description of that feature. Answer in ONE short, plain paragraph - what it's for, nothing more - then ask a brief follow-up like "want me to go into more detail?" rather than immediately explaining everything about it. Only go deeper than that first short answer if they actually say yes to that follow-up (or ask a specific follow-up question) - don't front-load the full explanation before they've asked for it.`
    );
  }

  if (logEntryAccess === "available" && activeVehicleKind === "car") {
    parts.push(
      "\n\n---\n\nLOGGING VIA CHAT (Pro feature, active now - Labour only): if the signed-in user describes a Labour/workshop-time charge they want to log for their car, use the proposeLogEntry tool to draft it, rather than telling them to go find the right form themselves. Only call it when they're clearly asking you to add/log something, never speculatively. This never saves anything by itself - it hands back a draft that appears on screen for them to review, edit, and confirm with their own click. Every OTHER category (service, fuel, mods, bills) is a real, current product gap for cars, not available via chat yet - if asked to log one of those, say so plainly and point them to the dashboard's own logging forms instead."
    );
  } else if (logEntryAccess === "available") {
    parts.push(
      "\n\n---\n\nLOGGING VIA CHAT (Pro feature, active now): if the signed-in user describes something they want to log - a consumable, a small maintenance item, an insurance/road-tax/MOT/finance payment, a modification/accessory (including general things like wax, polish, or cleaning products), a fuel fill-up, or labour/workshop time - use the proposeLogEntry tool to draft it, rather than telling them to go find the right form themselves. Only call it when they're clearly asking you to add/log something, never speculatively. This never saves anything by itself - it hands back a draft that appears on screen for them to review, edit, and confirm with their own click. Don't worry about picking the exact right sub-category yourself (e.g. the precise accessory type) - a reasonable guess is fine, since the draft card lets them correct it before confirming."
    );
  } else if (logEntryAccess === "upsell") {
    parts.push(
      "\n\n---\n\nLOGGING VIA CHAT: adding or logging a new entry by describing it in chat is a Pro feature, not available on this account. If asked to add/log something, say so plainly, and mention they can still add it themselves from the dashboard in a few seconds, or upgrade to Pro to have the assistant do it for them next time. Never attempt to draft or describe an entry as if it were being logged when this isn't available."
    );
  }

  if (compareVehicleNames) {
    parts.push(
      `\n\n---\n\nCURRENT PAGE: the signed-in user has the Compare vehicles page open, currently comparing: ${compareVehicleNames.join(", ")}. The getViewedComparison tool is available now. Call it BEFORE answering any question that could plausibly be about this comparison, even a vague, pronoun-only, or unqualified question with no explicit mention of "this comparison" - e.g. "which is cheaper?", "what does this show?", "is that right?". While this page is open, an unqualified question about "these vehicles" or "which one" defaults to being about THIS specific comparison, not a generic account-wide question - never fall back to a different personal-data tool without checking this one first just because the question didn't use those exact words.`
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

// Best-effort only - there's no IP-extraction utility anywhere else in
// this app to reuse (confirmed: no other feature does IP-based rate
// limiting). Whatever's proxying real traffic to this app is trusted to
// set x-forwarded-for; "unknown" for anything else just means every such
// request shares one IP-side bucket, which is an acceptable degradation,
// not a correctness bug.
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Every response after the anonymous-usage check below goes through
// this, so a newly-generated anon id cookie (see canSendAnonAssistantMessage's
// caller) reaches the browser regardless of which of this function's many
// return points actually fires.
function respond(anonIdToSetCookie: string | null, payload: unknown, init?: { status?: number }): NextResponse {
  const res = NextResponse.json(payload, init);
  if (anonIdToSetCookie) {
    res.cookies.set(ANON_ID_COOKIE, anonIdToSetCookie, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: ANON_ID_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }
  return res;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Assistant is not configured." }, { status: 503 });
  }

  let body: { messages?: ChatMessage[]; reportToken?: string; dashboardTab?: string; compareVehicleIds?: string[]; compareFrom?: string; compareTo?: string };
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

  // 10 messages/day, only while signed out - see assistantAnonUsage.ts.
  // Checked as early as possible once signedIn is known, before any
  // Gemini call is made, so an over-the-cap visitor never actually
  // consumes a real API call.
  let anonIdToSetCookie: string | null = null;
  if (!signedIn) {
    let anonId = req.cookies.get(ANON_ID_COOKIE)?.value;
    if (!anonId) {
      anonId = generateAnonId();
      anonIdToSetCookie = anonId;
    }
    const allowed = await canSendAnonAssistantMessage(anonId, clientIp(req));
    if (!allowed) {
      return respond(
        anonIdToSetCookie,
        { error: "You've reached today's free message limit - log in for unlimited messages, or try again tomorrow." },
        { status: 429 }
      );
    }
  }

  // Which knowledge base and log-entry gating apply for this request -
  // resolved once here via the same resolveActiveVehicle() every tool in
  // assistantTools.ts already uses, rather than re-deriving it a second,
  // possibly-inconsistent way. Fails soft to null (treated as "bike",
  // the pre-car-support default) on any error, same reasoning as every
  // other best-effort block in this route.
  let activeVehicleKind: "bike" | "car" | null = null;
  if (signedIn && session) {
    try {
      const vehicle = await resolveActiveVehicle(session.email);
      activeVehicleKind = vehicle?.kind ?? null;
    } catch (err) {
      console.error("Assistant: resolveActiveVehicle() failed, continuing without a known vehicle kind:", err);
    }
  }

  // Set from the Settings tab's own profile section - best-effort, same
  // fail-soft-to-null reasoning as activeVehicleKind above: a lookup
  // hiccup here should just mean the assistant addresses the user
  // generically this request, never a broken/hanging chat.
  let displayName: string | null = null;
  if (signedIn && session) {
    try {
      const user = await getUserDoc(session.email);
      displayName = user?.displayName ?? null;
    } catch (err) {
      console.error("Assistant: getUserDoc() failed, continuing without a display name:", err);
    }
  }

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
  const dashboardTabKey = signedIn && typeof body.dashboardTab === "string" ? body.dashboardTab : null;
  const dashboardTabLabel = dashboardTabKey ? DASHBOARD_TAB_LABELS[dashboardTabKey] ?? null : null;
  const dashboardTabGroupLabel = dashboardTabKey ? TAB_GROUP_LABELS[dashboardTabKey] ?? null : null;

  // Only ever trusted after being cross-checked against this session's
  // own real bikes/cars and Pro status below - the client sends raw ids
  // read straight from its own URL, which is just a hint about what's on
  // screen, never enough on its own to decide what the assistant can
  // see (same reasoning as reportToken above). Silently ends up null
  // (no tool offered) for anything that doesn't check out, rather than
  // erroring the whole request over a stale or tampered hint. Matched
  // against BOTH bikes and cars (the garage compare page mixes both
  // kinds in one picker - see vehicleComparison.ts), preserving the
  // original requested order so the merged comparison the tool returns
  // lines up with what's actually on screen.
  let compareContext: CompareContext | null = null;
  let compareVehicleNames: string[] | null = null;
  if (signedIn && session && Array.isArray(body.compareVehicleIds) && body.compareVehicleIds.length > 0) {
    try {
      const userIsPro = await isPro(session.email);
      if (userIsPro) {
        const [bikes, cars] = await Promise.all([getBikesForUser(session.email), getCarsForUser(session.email)]);
        const ownActiveBikes = bikes.filter((b) => !isBikeReadOnly(b));
        const ownActiveCars = cars.filter((c) => !isCarReadOnly(c));
        const requestedIds = body.compareVehicleIds.filter((id): id is string => typeof id === "string");
        const matchedBikes = requestedIds.map((id) => ownActiveBikes.find((b) => b.id === id)).filter((b): b is NonNullable<typeof b> => !!b);
        const matchedCars = requestedIds.map((id) => ownActiveCars.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
        const matchedIds = new Set([...matchedBikes.map((b) => b.id), ...matchedCars.map((c) => c.id)]);
        const vehicleIds = requestedIds.filter((id) => matchedIds.has(id));
        if (vehicleIds.length >= MIN_COMPARE_VEHICLES && vehicleIds.length <= MAX_COMPARE_VEHICLES) {
          const from = typeof body.compareFrom === "string" && body.compareFrom ? body.compareFrom : undefined;
          const to = typeof body.compareTo === "string" && body.compareTo ? body.compareTo : undefined;
          compareContext = { vehicleIds, bikeIds: matchedBikes.map((b) => b.id), carIds: matchedCars.map((c) => c.id), from, to };
          const nameById = new Map([
            ...matchedBikes.map((b): [string, string] => [b.id, b.nickname ? `${b.nickname} (${b.make} ${b.model})` : `${b.make} ${b.model}`]),
            ...matchedCars.map((c): [string, string] => [c.id, c.nickname ? `${c.nickname} (${c.make} ${c.model})` : `${c.make} ${c.model}`]),
          ]);
          compareVehicleNames = vehicleIds.map((id) => nameById.get(id)!).filter(Boolean);
        }
      }
    } catch (err) {
      console.error("Assistant: compare-context validation failed, continuing without it:", err);
    }
  }

  // Same fail-open-to-"none" reasoning as compareContext above - an
  // isPro() hiccup should just mean the feature isn't offered this
  // request, never a broken/hanging chat. Pro-gating itself is identical
  // for bike and car sessions alike - which CATEGORIES the tool actually
  // offers is what differs by vehicle kind (see
  // buildLogEntryToolDeclarations below), not whether it's offered at all.
  let logEntryAccess: "available" | "upsell" | "none" = "none";
  if (signedIn && session) {
    try {
      logEntryAccess = (await isPro(session.email)) ? "available" : "upsell";
    } catch (err) {
      console.error("Assistant: isPro() failed for log-entry gating, continuing without it:", err);
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
  // not quietly running on stale content nobody chose. This still
  // applies to a car-active session too - the motorcycle config also
  // holds the shared/global personality settings buildSystemInstruction
  // needs regardless of which knowledge base ends up injected.
  if (!config) {
    console.error("Assistant: getAssistantConfig() returned null - config document missing or unreadable.");
    await logAssistantQuestion(question, signedIn, true, session?.email);
    return respond(anonIdToSetCookie, { error: "Assistant is temporarily unavailable." }, { status: 503 });
  }

  // A car-active session gets its own, completely separate knowledge
  // base document - never a fallback to the motorcycle one above, even
  // on a read failure or before anything's ever been saved, since that
  // would hand motorcycle-specific content to a car-active session
  // (the exact leak Phase 8's vehicle-kind-leakage tests exist to catch).
  let carKnowledgeBase: string | undefined;
  if (activeVehicleKind === "car") {
    try {
      const carConfig = await getCarAssistantConfig();
      carKnowledgeBase = carConfig?.knowledgeBase?.trim() ? carConfig.knowledgeBase : NO_CAR_KB_FALLBACK;
    } catch (err) {
      console.error("Assistant: getCarAssistantConfig() failed, continuing with the fallback car notice:", err);
      carKnowledgeBase = NO_CAR_KB_FALLBACK;
    }
  }

  const systemInstruction = buildSystemInstruction(config, signedIn, privacyPolicyText, !!reportToken, dashboardTabLabel, dashboardTabGroupLabel, compareVehicleNames, logEntryAccess, activeVehicleKind, displayName, carKnowledgeBase);

  const contents: GeminiContent[] = toGeminiContents(messages);
  const toolDeclarations = [
    ...(signedIn ? ASSISTANT_TOOL_DECLARATIONS : []),
    ...(reportToken ? REPORT_TOOL_DECLARATIONS : []),
    ...(compareContext ? COMPARISON_TOOL_DECLARATIONS : []),
    ...(logEntryAccess === "available" ? buildLogEntryToolDeclarations(activeVehicleKind === "car" ? "car" : "bike") : []),
  ];
  const tools = toolDeclarations.length > 0 ? [{ functionDeclarations: toolDeclarations }] : undefined;

  // Set only by a successful (no .error) proposeLogEntry call, and only
  // ever read once, on the final reply below - if the model calls it
  // more than once in the same request, the latest draft wins, matching
  // "the last thing it proposed is what's on screen" rather than
  // stacking multiple cards from one exchange.
  let proposedEntry: ProposedEntry | null = null;

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
        return respond(anonIdToSetCookie, { error: "Assistant is temporarily unavailable." }, { status: 502 });
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

        if (name === "proposeLogEntry" && toolResult && typeof toolResult === "object" && !("error" in toolResult)) {
          proposedEntry = toolResult as ProposedEntry;
        }

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
        return respond(anonIdToSetCookie, { error: "Assistant is temporarily unavailable." }, { status: 502 });
      }
      await logAssistantQuestion(question, signedIn, false, session?.email);
      return respond(anonIdToSetCookie, { reply: replyText, ...(proposedEntry ? { proposedEntry } : {}) });
    }

    await logAssistantQuestion(question, signedIn, true, session?.email);
    return respond(anonIdToSetCookie, { error: "Assistant took too many steps to answer that - try rephrasing." }, { status: 502 });
  } catch (err) {
    console.error("Assistant: unhandled error:", err);
    await logAssistantQuestion(question, signedIn, true, session?.email);
    return respond(anonIdToSetCookie, { error: "Assistant is temporarily unavailable." }, { status: 502 });
  }
}
