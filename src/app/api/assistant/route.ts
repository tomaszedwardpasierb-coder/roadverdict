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
import { markOnboardingStepComplete } from "@/lib/tracker/userAccount";
import {
  canSendAnonAssistantMessage,
  generateAnonId,
  ANON_ID_COOKIE,
  ANON_ID_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/tracker/assistantAnonUsage";
import { getLivePrivacyPolicyText } from "@/lib/tracker/assistantKnowledge";
import { getAssistantConfig, getCarAssistantConfig, type AssistantConfigDoc } from "@/lib/tracker/assistantConfig";
import { resolveActiveVehicle, type ResolvedActiveVehicle } from "@/lib/tracker/activeVehicle";
import { getDocWithEtag } from "@/lib/tracker/atomicUpdate";
import type { UserDoc } from "@/lib/tracker/userDoc";
import { canSendAssistantMessage, recordAssistantMessage } from "@/lib/tracker/assistantSignedInUsage";
import {
  ASSISTANT_TOOL_DECLARATIONS,
  REPORT_TOOL_DECLARATIONS,
  COMPARISON_TOOL_DECLARATIONS,
  buildLogEntryToolDeclarations,
  SETTINGS_TOOL_DECLARATIONS,
  SHARE_LINK_TOOL_DECLARATIONS,
  EDIT_TOOL_DECLARATIONS,
  VAULT_TOOL_DECLARATIONS,
  FEEDBACK_TOOL_DECLARATIONS,
  runAssistantTool,
  type CompareContext,
  type ProposedEntry,
  type ProposedSettingsChange,
  type ProposedShareLink,
  type ProposedVaultDocument,
  type ProposedFeedback,
} from "@/lib/tracker/assistantTools";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";
import { logAssistantQuestion } from "@/lib/tracker/assistantQuestionLog";
import { logGeminiUsage } from "@/lib/tracker/geminiUsageLog";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { resolveShareToken } from "@/lib/tracker/shareLink";
import { hasReportAccess } from "@/lib/tracker/reportAccess";
import { getBikesForUser, isBikeReadOnly } from "@/lib/tracker/bike";
import { getCarsForUser, isCarReadOnly } from "@/lib/tracker/car";
import { isPro } from "@/lib/subscriptions";
import { isTwoFactorEnabled } from "@/lib/auth/twoFactor";
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

function buildSystemInstruction(config: AssistantConfigDoc, signedIn: boolean, privacyPolicyText: string | null, reportOpen: boolean, dashboardTabLabel: string | null, dashboardTabGroupLabel: string | null, compareVehicleNames: string[] | null, logEntryAccess: "available" | "upsell" | "none", activeVehicleKind: "bike" | "car" | null, displayName: string | null, carKnowledgeBase?: string, vaultChatAccess?: "available" | "unavailable", hasAttachment?: boolean): string {
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

  if (logEntryAccess === "available") {
    parts.push(
      "\n\n---\n\nLOGGING VIA CHAT (Pro feature, active now): if the signed-in user describes something they want to log - a consumable, a small maintenance item, an insurance/road-tax/MOT/finance payment (plus ULEZ/CAZ or Congestion Charge for a car), a modification/accessory (including general things like wax, polish, or cleaning products), a fuel fill-up or EV charging session, labour/workshop time, a fine/penalty, or a toll/parking charge - use the proposeLogEntry tool to draft it, rather than telling them to go find the right form themselves. Only call it when they're clearly asking you to add/log something, never speculatively. This never saves anything by itself - it hands back a draft that appears on screen for them to review, edit, and confirm with their own click. Don't worry about picking the exact right sub-category yourself (e.g. the precise accessory type) - a reasonable guess is fine, since the draft card lets them correct it before confirming. Available identically for both bike and car accounts."
    );
    parts.push(
      "\n\n---\n\nLOGGING SEVERAL THINGS IN ONE REQUEST: if they describe more than one thing to log in a single message (e.g. \"log an oil change and a new tyre\"), only draft the FIRST one with proposeLogEntry - the draft card only ever shows one item at a time, and confirming it automatically sends you a short follow-up message that reads roughly \"That's logged, if there's anything else from what I just asked you to log, draft the next one now.\" When you receive that follow-up, look back at the original request: if there's still an item from it you haven't drafted yet, call proposeLogEntry for the next one now, in the same reasonable-guess spirit as any other draft. If everything from the original request has already been drafted and confirmed, just say so plainly (e.g. \"That's everything - both are logged.\") and don't invent anything new to log."
    );
    parts.push(
      "\n\n---\n\nCHANGING SETTINGS OR CREATING A SHARE LINK VIA CHAT (Pro feature, active now): if they ask to change an account/vehicle setting - current mileage, region, annual budget, currency, distance/fuel-economy units, or which categories (insurance, finance, fines, tolls, valeting/washing) show in their buyer report - use the proposeSettingsChange tool, including only the fields they actually asked to change. If they ask for a shareable report link to send a buyer, use the proposeShareLink tool - always ask who it's for (their email) first, unless already given, and never invent one. Both tools only ever prepare a draft for the user to review and confirm themselves on screen; neither changes or creates anything by itself."
    );
    parts.push(
      "\n\n---\n\nEDITING AN ALREADY-LOGGED ENTRY VIA CHAT (Pro feature, active now): if they ask to change something already logged - a wrong cost, date, category, or anything else about an existing service/bill/mod/fuel/labour/fine/toll entry - use the proposeEditEntry tool. It REQUIRES a real entryId, which only ever comes from actually looking the entry up first (getEntries for a date/range, or getLastLoggedJob for something like 'my last oil change') - never invent or guess one, and never call proposeEditEntry before you've resolved which specific entry they mean. If more than one entry could match, ask which one rather than guessing. Only include the fields that are actually changing - everything else keeps its current logged value. This can only edit an entry that already exists, and can NEVER delete one - if asked to delete something, say plainly that deleting isn't available via chat yet and point them to the dashboard instead."
    );
  } else if (logEntryAccess === "upsell") {
    parts.push(
      "\n\n---\n\nLOGGING VIA CHAT: adding or logging a new entry, editing an existing one, changing a setting, or creating a share link by describing it in chat is a Pro feature, not available on this account. If asked to do any of those, say so plainly, and mention they can still do it themselves from the dashboard in a few seconds, or upgrade to Pro to have the assistant do it for them next time. Never attempt to draft or describe any of this as if it were actually happening when it isn't available."
    );
  }

  if (vaultChatAccess === "available") {
    parts.push(
      "\n\n---\n\nADDING A DOCUMENT TO THE VAULT VIA CHAT (Pro + 2FA feature, active now): if they want to store a real document - a V5C logbook, MOT certificate, insurance certificate, driving licence, warranty, or similar (see the knowledge base's own Vault section, 6.13a, for the full category list) - use the proposeVaultDocument tool. Guess the best category and an optional short label from what they describe; you never see or need the file itself, since the draft card is where they pick and upload it themselves. If the Vault happens to be locked, the card handles re-authentication itself - you don't need to ask them to unlock anything first. Never use this for a cost/expense - that's proposeLogEntry, not the Vault."
    );
  } else if (signedIn) {
    parts.push(
      "\n\n---\n\nADDING A DOCUMENT TO THE VAULT VIA CHAT: not available on this account yet - the Vault itself requires Pro AND two-factor authentication enabled (Security tab), regardless of whether chat drafting is otherwise available. If asked to add a document to the Vault, say so plainly and name whichever of Pro/2FA is actually missing if you can tell, rather than attempting to draft it."
    );
  }

  // No Pro/logEntryAccess gate, deliberately - the manual "Feature
  // request / report a bug" form in Settings has never had one either.
  if (signedIn) {
    parts.push(
      "\n\n---\n\nSENDING FEEDBACK VIA CHAT: if the signed-in user wants to report a bug or request a feature, use the proposeFeedback tool to draft it - never send it yourself, it only prepares a draft for them to review and confirm on screen. If it's a bug report, mention in your reply that they can attach up to 3 screenshots (PNG/JPG only) on the draft card before confirming. This is unrelated to logging a cost/expense (that's proposeLogEntry) - only use this when they're actually asking to report a problem with RoadVerdict itself or suggest an improvement to it."
    );
  }

  if (hasAttachment) {
    parts.push(
      "\n\n---\n\nTHE USER HAS JUST ATTACHED A FILE to this message (a receipt, photo, or document). If they're describing something to log (proposeLogEntry/proposeEditEntry), the draft you create will automatically carry this attachment - you don't need to ask them to attach it again, and you don't need to mention the file mechanically; just draft normally. If instead they want to store this as a Vault document, use proposeVaultDocument as usual - the file they already picked here does NOT carry over to the Vault automatically (it's a different, more secure storage system with its own upload step), so the Vault draft card will ask them to pick the file again there; mention that plainly if it's relevant."
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

  let body: { messages?: ChatMessage[]; reportToken?: string; dashboardTab?: string; compareVehicleIds?: string[]; compareFrom?: string; compareTo?: string; attachment?: unknown };
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

  // Whatever the person attached to THIS turn's own message - already
  // uploaded via the same /api/tracker/upload-attachment endpoint the
  // manual dashboard forms use, so by the time it reaches here it's a
  // real blobName, not a file. Shape-checked, not trusted blindly: a
  // malformed value is simply ignored (treated as no attachment) rather
  // than failing the whole request over something that only affects a
  // nice-to-have.
  const ATTACHMENT_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];
  const rawAttachment = body.attachment as { blobName?: unknown; fileName?: unknown; fileType?: unknown; uploadedAt?: unknown } | undefined;
  const attachment: Attachment | undefined =
    rawAttachment &&
    typeof rawAttachment.blobName === "string" &&
    typeof rawAttachment.fileName === "string" &&
    typeof rawAttachment.uploadedAt === "string" &&
    typeof rawAttachment.fileType === "string" &&
    ATTACHMENT_FILE_TYPES.includes(rawAttachment.fileType)
      ? (rawAttachment as Attachment)
      : undefined;

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

  // 150 messages/day once signed in - see assistantSignedInUsage.ts for
  // why this exists at all (previously truly unlimited) and why this
  // number specifically (a generous anti-abuse floor, not a precisely
  // computed budget). Checked as early as possible, same reasoning as
  // the anonymous check above - an over-the-cap account never actually
  // reaches a Gemini call. Reuses the same getUserDoc() read the
  // display-name lookup below already needs, rather than a second one.
  // Fails soft to "allowed" on a lookup error (same direction every
  // other best-effort block in this route already fails), never soft to
  // "blocked" - a Cosmos hiccup shouldn't lock a real account out of the
  // assistant entirely.
  let displayName: string | null = null;
  if (signedIn && session) {
    try {
      const current = await getDocWithEtag<UserDoc>(session.email, session.email);
      displayName = current?.doc.displayName ?? null;
      if (current && !canSendAssistantMessage(current.doc)) {
        return NextResponse.json(
          { error: "You've reached today's message limit for the assistant - try again tomorrow." },
          { status: 429 }
        );
      }
      // Recorded atomically against the exact doc/etag just read above -
      // see assistantSignedInUsage.ts's own comment for why a plain
      // read-then-upsert here let concurrent messages near the daily cap
      // all get through. Losing this race (alreadyUsed: true) isn't
      // treated as an error - the cap check above already ran, so this
      // message is allowed through either way; it's only relevant to a
      // very rare, harmless double-count.
      if (current) await recordAssistantMessage(session.email, current.etag, current.doc);
    } catch (err) {
      console.error("Assistant: message-cap check failed, continuing without a display name:", err);
    }
  }

  // Which knowledge base and log-entry gating apply for this request -
  // resolved once here, and threaded through to every tool call below
  // (see the runAssistantTool call's resolvedVehicle argument) rather
  // than each tool independently re-resolving the same account's same
  // active vehicle via its own resolveActiveVehicle(email) call - a
  // multi-tool exchange was re-querying bikes+cars once per tool call
  // for a value that can't change mid-request (same email, same
  // request-scoped cookie jar). Fails soft to null (treated as "bike",
  // the pre-car-support default) on any error, same reasoning as every
  // other best-effort block in this route.
  let activeVehicleKind: "bike" | "car" | null = null;
  let resolvedVehicle: ResolvedActiveVehicle | null = null;
  if (signedIn && session) {
    try {
      resolvedVehicle = await resolveActiveVehicle(session.email);
      activeVehicleKind = resolvedVehicle?.kind ?? null;
    } catch (err) {
      console.error("Assistant: resolveActiveVehicle() failed, continuing without a known vehicle kind:", err);
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
  // Computed once and reused by both this block and the logEntryAccess
  // block below - isPro() can't change mid-request, so there's no reason
  // to spend a second Cosmos read on the identical value. Caught to null
  // (not folded into false) so each block below can still tell "genuinely
  // not Pro" apart from "the lookup itself failed" and keep its own
  // existing fail-soft behavior.
  const userIsProResult: Promise<boolean | null> = signedIn && session ? isPro(session.email).catch(() => null) : Promise.resolve(null);

  let compareContext: CompareContext | null = null;
  let compareVehicleNames: string[] | null = null;
  if (signedIn && session && Array.isArray(body.compareVehicleIds) && body.compareVehicleIds.length > 0) {
    try {
      const userIsPro = await userIsProResult;
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
    const userIsPro = await userIsProResult;
    logEntryAccess = userIsPro === null ? "none" : userIsPro ? "available" : "upsell";
  }

  // Same Pro requirement as logEntryAccess, plus 2FA - exactly what
  // opening the Vault tab itself already requires (see vaultAccess.ts's
  // checkVaultGate). Whether the Vault is currently LOCKED is
  // deliberately not part of this check - that's resolved on the draft
  // card itself (same VaultAuthModal re-auth flow the Vault tab uses),
  // not here, so a locked-but-otherwise-eligible account still gets the
  // tool offered rather than a confusing "not available" for something
  // that's really just one code entry away.
  let vaultChatAccess: "available" | "unavailable" = "unavailable";
  if (signedIn && session) {
    try {
      const [userIsPro, has2fa] = await Promise.all([userIsProResult, isTwoFactorEnabled(session.email)]);
      vaultChatAccess = userIsPro && has2fa ? "available" : "unavailable";
    } catch (err) {
      console.error("Assistant: vaultChatAccess check failed, continuing without the Vault tool:", err);
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

  const systemInstruction = buildSystemInstruction(config, signedIn, privacyPolicyText, !!reportToken, dashboardTabLabel, dashboardTabGroupLabel, compareVehicleNames, logEntryAccess, activeVehicleKind, displayName, carKnowledgeBase, vaultChatAccess, !!attachment);

  const contents: GeminiContent[] = toGeminiContents(messages);
  const toolDeclarations = [
    ...(signedIn ? ASSISTANT_TOOL_DECLARATIONS : []),
    // No Pro gate, unlike the write tools further down - matches the
    // existing manual "Feature request / report a bug" form in
    // Settings, which has never had one either (see feedback.ts's own
    // comment on why this stays independent of logEntryAccess).
    ...(signedIn ? FEEDBACK_TOOL_DECLARATIONS : []),
    ...(reportToken ? REPORT_TOOL_DECLARATIONS : []),
    ...(compareContext ? COMPARISON_TOOL_DECLARATIONS : []),
    ...(logEntryAccess === "available" ? buildLogEntryToolDeclarations(activeVehicleKind === "car" ? "car" : "bike") : []),
    // Same Premium-only gate as log-entry drafting above - settings
    // changes and share-link creation are the same class of capability
    // (the assistant changing something on the account), not a lookup.
    ...(logEntryAccess === "available" ? SETTINGS_TOOL_DECLARATIONS : []),
    ...(logEntryAccess === "available" ? SHARE_LINK_TOOL_DECLARATIONS : []),
    ...(logEntryAccess === "available" ? EDIT_TOOL_DECLARATIONS : []),
    // Its own, stricter gate (Pro AND 2FA) - see vaultChatAccess above.
    ...(vaultChatAccess === "available" ? VAULT_TOOL_DECLARATIONS : []),
  ];
  const tools = toolDeclarations.length > 0 ? [{ functionDeclarations: toolDeclarations }] : undefined;

  // Set only by a successful (no .error) proposeLogEntry call, and only
  // ever read once, on the final reply below - if the model calls it
  // more than once in the same request, the latest draft wins, matching
  // "the last thing it proposed is what's on screen" rather than
  // stacking multiple cards from one exchange.
  let proposedEntry: ProposedEntry | null = null;
  let proposedSettingsChange: ProposedSettingsChange | null = null;
  let proposedShareLink: ProposedShareLink | null = null;
  let proposedVaultDocument: ProposedVaultDocument | null = null;
  let proposedFeedback: ProposedFeedback | null = null;

  try {
    // Bounded rather than while(true) - a tool-call loop that somehow
    // never terminates should fail loudly with a real response, not
    // hang the request indefinitely.
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
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
        logGeminiUsage("assistant", GEMINI_MODEL, false);
        await logAssistantQuestion(question, signedIn, true, session?.email);
        return respond(anonIdToSetCookie, { error: "Assistant is temporarily unavailable." }, { status: 502 });
      }
      logGeminiUsage("assistant", GEMINI_MODEL, true);

      const data = await res.json();
      const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
      const functionCallPart = parts.find((p) => p.functionCall);

      if (functionCallPart?.functionCall && (session || reportToken) && round < MAX_TOOL_ROUNDS) {
        const { name, args } = functionCallPart.functionCall;
        // session.email only - never anything from `args`, which is
        // model-supplied and therefore untrusted for identity purposes.
        // reportToken is this same request's own server-validated value
        // from above, for the same reason.
        const toolResult = await runAssistantTool(name, args ?? {}, session?.email ?? "", resolvedVehicle, reportToken ?? undefined, compareContext ?? undefined, attachment);

        if ((name === "proposeLogEntry" || name === "proposeEditEntry") && toolResult && typeof toolResult === "object" && !("error" in toolResult)) {
          proposedEntry = toolResult as ProposedEntry;
        }
        if (name === "proposeSettingsChange" && toolResult && typeof toolResult === "object" && !("error" in toolResult)) {
          proposedSettingsChange = toolResult as ProposedSettingsChange;
        }
        if (name === "proposeShareLink" && toolResult && typeof toolResult === "object" && !("error" in toolResult)) {
          proposedShareLink = toolResult as ProposedShareLink;
        }
        if (name === "proposeVaultDocument" && toolResult && typeof toolResult === "object" && !("error" in toolResult)) {
          proposedVaultDocument = toolResult as ProposedVaultDocument;
        }
        if (name === "proposeFeedback" && toolResult && typeof toolResult === "object" && !("error" in toolResult)) {
          proposedFeedback = toolResult as ProposedFeedback;
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
      if (session) await markOnboardingStepComplete(session.email, "used-ai-assistant").catch(() => {});
      return respond(anonIdToSetCookie, {
        reply: replyText,
        ...(proposedEntry ? { proposedEntry } : {}),
        ...(proposedSettingsChange ? { proposedSettingsChange } : {}),
        ...(proposedShareLink ? { proposedShareLink } : {}),
        ...(proposedVaultDocument ? { proposedVaultDocument } : {}),
        ...(proposedFeedback ? { proposedFeedback } : {}),
      });
    }

    await logAssistantQuestion(question, signedIn, true, session?.email);
    return respond(anonIdToSetCookie, { error: "Assistant took too many steps to answer that - try rephrasing." }, { status: 502 });
  } catch (err) {
    console.error("Assistant: unhandled error:", err);
    await logAssistantQuestion(question, signedIn, true, session?.email);
    return respond(anonIdToSetCookie, { error: "Assistant is temporarily unavailable." }, { status: 502 });
  }
}
