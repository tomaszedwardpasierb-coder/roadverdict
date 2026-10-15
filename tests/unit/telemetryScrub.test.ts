// Secrets must not reach Application Insights: the VDG key rides in the
// query string of every lookup, and sign-in tokens/codes ride in URLs.
import { describe, expect, it } from "vitest";
import { installTelemetryScrubbers, scrubSecrets, ScrubbingLogRecordProcessor, ScrubbingSpanProcessor } from "@/lib/telemetryScrub";

describe("scrubSecrets", () => {
  it("hides the VDG key but leaves the rest of the URL readable", () => {
    expect(scrubSecrets("https://uk.api.vehicledataglobal.com/r2/lookup?apiKey=SECRET123&packageName=MotHistoryDetails&vrm=AB12CDE")).toBe(
      "https://uk.api.vehicledataglobal.com/r2/lookup?apiKey=[redacted]&packageName=MotHistoryDetails&vrm=AB12CDE"
    );
  });

  it("hides it wherever it sits in the query, and in message text", () => {
    expect(scrubSecrets("https://x.test/a?vrm=AB12&apiKey=SECRET123")).toBe("https://x.test/a?vrm=AB12&apiKey=[redacted]");
    expect(scrubSecrets("fetch failed for apiKey=SECRET123 (timeout)")).toBe("fetch failed for apiKey=[redacted] (timeout)");
    expect(scrubSecrets("GET /r2/lookup?APIKEY=SECRET123")).toBe("GET /r2/lookup?APIKEY=[redacted]");
  });

  it("hides one-time sign-in tokens and codes in URLs", () => {
    expect(scrubSecrets("/api/auth/verify?token=abc123&next=/dashboard")).toBe("/api/auth/verify?token=[redacted]&next=/dashboard");
    expect(scrubSecrets("/api/auth/google/callback?code=4/0Abc&state=xyz")).toBe("/api/auth/google/callback?code=[redacted]&state=[redacted]");
  });

  it("leaves ordinary text alone", () => {
    for (const text of ["https://roadverdict.co.uk/pro", "GET /api/tracker/notifications", "postcode=SW1A1AA", "barcode=123"]) {
      expect(scrubSecrets(text)).toBe(text);
    }
  });
});

describe("ScrubbingSpanProcessor", () => {
  it("scrubs the URL attributes of a finished span in place, and its events", () => {
    const span = {
      attributes: { "url.full": "https://uk.api.vehicledataglobal.com/r2/lookup?apiKey=SECRET123&vrm=AB12", "http.status_code": 200, name: "GET" },
      events: [{ attributes: { "exception.message": "failed: apiKey=SECRET123" } }],
    };
    new ScrubbingSpanProcessor().onEnd(span);
    expect(span.attributes["url.full"]).toBe("https://uk.api.vehicledataglobal.com/r2/lookup?apiKey=[redacted]&vrm=AB12");
    expect(span.attributes["http.status_code"]).toBe(200);
    expect(span.events[0].attributes["exception.message"]).toBe("failed: apiKey=[redacted]");
  });

  it("never throws, whatever it is handed", () => {
    const processor = new ScrubbingSpanProcessor();
    expect(() => processor.onEnd({})).not.toThrow();
    expect(() => processor.onEnd({ attributes: Object.freeze({ "url.full": "https://x.test/?apiKey=A" }) })).not.toThrow();
    expect(() => processor.onEnd(null as never)).not.toThrow();
  });
});

describe("ScrubbingLogRecordProcessor", () => {
  it("scrubs a log line's text and attributes", () => {
    const record = { body: "lookup failed https://x.test/?apiKey=SECRET123", attributes: { url: "https://x.test/?apiKey=SECRET123" } };
    new ScrubbingLogRecordProcessor().onEmit(record);
    expect(record.body).toBe("lookup failed https://x.test/?apiKey=[redacted]");
    expect(record.attributes.url).toBe("https://x.test/?apiKey=[redacted]");
  });

  it("never throws", () => {
    expect(() => new ScrubbingLogRecordProcessor().onEmit({})).not.toThrow();
    expect(() => new ScrubbingLogRecordProcessor().onEmit(null as never)).not.toThrow();
  });
});

describe("installTelemetryScrubbers", () => {
  it("adds both scrubbers to the options the library builds, keeping the ones already there", () => {
    const existingSpan = { id: "span" };
    const existingLog = { id: "log" };
    const parseConfig = () => ({ spanProcessors: [existingSpan], logRecordProcessors: [existingLog], other: 1 });
    const appInsights = { defaultClient: { config: { parseConfig } } };
    expect(installTelemetryScrubbers(appInsights)).toBe(true);
    const options = appInsights.defaultClient.config.parseConfig() as { spanProcessors: unknown[]; logRecordProcessors: unknown[]; other: number };
    expect(options.other).toBe(1);
    expect(options.spanProcessors[0]).toBe(existingSpan);
    expect(options.spanProcessors[1]).toBeInstanceOf(ScrubbingSpanProcessor);
    expect(options.logRecordProcessors[0]).toBe(existingLog);
    expect(options.logRecordProcessors[1]).toBeInstanceOf(ScrubbingLogRecordProcessor);
  });

  it("works when the library has no processors yet", () => {
    const appInsights = { defaultClient: { config: { parseConfig: () => ({}) } } };
    expect(installTelemetryScrubbers(appInsights)).toBe(true);
    const options = appInsights.defaultClient.config.parseConfig() as unknown as { spanProcessors: unknown[] };
    expect(options.spanProcessors).toHaveLength(1);
  });

  it("does nothing, without throwing, if the library's shape has changed", () => {
    expect(installTelemetryScrubbers(undefined)).toBe(false);
    expect(installTelemetryScrubbers({})).toBe(false);
    expect(installTelemetryScrubbers({ defaultClient: { config: {} } })).toBe(false);
  });
});
