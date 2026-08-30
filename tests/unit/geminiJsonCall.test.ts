import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callGeminiForJson } from "@/lib/tracker/geminiJsonCall";

function geminiResponse(bodyText: string) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: bodyText }] } }] }),
  };
}

describe("callGeminiForJson", () => {
  const validate = vi.fn((parsed: unknown) => {
    if (typeof parsed === "object" && parsed !== null && "summary" in parsed) return parsed as { summary: string };
    return null;
  });

  beforeEach(() => {
    validate.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the validated result on a well-formed successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ summary: "Looks fair." }))));

    const result = await callGeminiForJson("system prompt", "facts", "key", validate);

    expect(result).toEqual({ summary: "Looks fair." });
  });

  it("passes the actually-parsed JSON object to validate, not the raw string", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ summary: "x" }))));

    await callGeminiForJson("system prompt", "facts", "key", validate);

    expect(validate).toHaveBeenCalledWith({ summary: "x" });
  });

  it("builds the request with the right URL, headers, and body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ summary: "x" })));
    vi.stubGlobal("fetch", fetchMock);

    await callGeminiForJson("Be helpful.", "FACT: bike is fine.", "my-api-key", validate);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("generateContent");
    expect(init.headers["X-goog-api-key"]).toBe("my-api-key");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].text).toBe("Be helpful.\n\nFACTS:\nFACT: bike is fine.");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  // The core fail-soft guarantee this module exists for: nothing Gemini
  // does, however broken, should ever throw past this boundary into a
  // page render. Each of the following represents a genuinely different
  // way the outside world can misbehave.

  it("fails soft to null on a non-ok HTTP response, without calling validate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    const result = await callGeminiForJson("p", "f", "k", validate);

    expect(result).toBeNull();
    expect(validate).not.toHaveBeenCalled();
  });

  it("fails soft to null when fetch itself throws, e.g. a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")));

    await expect(callGeminiForJson("p", "f", "k", validate)).resolves.toBeNull();
  });

  it("fails soft to null when the response has no text in the expected shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) }));

    expect(await callGeminiForJson("p", "f", "k", validate)).toBeNull();
  });

  it("fails soft to null when the model's own text isn't valid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse("not actually json")));

    expect(await callGeminiForJson("p", "f", "k", validate)).toBeNull();
  });

  it("returns null when validate itself rejects the parsed shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ wrongShape: true }))));

    expect(await callGeminiForJson("p", "f", "k", validate)).toBeNull();
    expect(validate).toHaveBeenCalledWith({ wrongShape: true });
  });

  it("fails soft to null if response.json() itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new Error("malformed response body"); },
    }));

    expect(await callGeminiForJson("p", "f", "k", validate)).toBeNull();
  });
});