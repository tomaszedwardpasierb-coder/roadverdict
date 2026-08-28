// Place at: src/lib/tracker/geminiJsonCall.ts
//
// The one piece every Gemini-backed narration module in this app shares
// verbatim - the fetch, the JSON-response-format request, and fail-soft-
// to-null handling. Extracted here specifically because the two new
// "why" narrations built together (quoteAdvice.ts, costAdvice.ts) would
// otherwise duplicate this boilerplate a second and third time in one
// sitting. The three earlier modules (buyerOpinionProse.ts, storyProse.ts,
// buyingGuideBriefing.ts) each still carry their own copy of this same
// logic and are deliberately left alone - refactoring already-shipped,
// working code onto this isn't part of what changed here.
//
// Each caller supplies its own system prompt, its own facts block, and a
// validate function that both shape-checks the parsed JSON and filters
// it down to known-string arrays - the one part that's genuinely
// different per use case, so it stays with each caller rather than
// being forced in here.

const GEMINI_MODEL = "gemini-3.5-flash-lite";

export async function callGeminiForJson<T>(
  systemPrompt: string,
  factsBlock: string,
  apiKey: string,
  validate: (parsed: unknown) => T | null
): Promise<T | null> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nFACTS:\n${factsBlock}` }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    return validate(JSON.parse(rawText));
  } catch {
    return null;
  }
}