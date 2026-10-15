// Place at: src/lib/telemetryScrub.ts
//
// Keeps secrets out of Application Insights. VDG takes its API key in the
// query string, and the telemetry library records every outgoing call with
// its full URL - so the live key was sitting in plain text in the logs.
// The same goes for one-time sign-in codes and tokens in incoming URLs.
//
// Pure data-in, data-out and no imports: instrumentation.ts is bundled for
// more than one runtime, so nothing Node-only may go in here. Every
// function is written to never throw - a telemetry helper must not be able
// to break a request.

const SECRET_PARAM = /(^|[?&;\s"'(,])((?:apiKey|api_key|access_token|token|code|state)=)[^&\s"'#)]+/gi;

export function scrubSecrets(text: string): string {
  try {
    return text.replace(SECRET_PARAM, '$1$2[redacted]');
  } catch {
    return text;
  }
}

function scrubRecord(record: unknown): void {
  if (!record || typeof record !== 'object') return;
  const bag = record as Record<string, unknown>;
  for (const key of Object.keys(bag)) {
    const value = bag[key];
    if (typeof value === 'string' && value.includes('=')) {
      const cleaned = scrubSecrets(value);
      if (cleaned !== value) bag[key] = cleaned;
    }
  }
}

// An OpenTelemetry span processor: runs when a span ends, before the
// exporter batches and sends it, and scrubs the URL-bearing attributes
// (url.full, http.url, ...) in place.
export class ScrubbingSpanProcessor {
  onStart(): void {}
  onEnd(span: { attributes?: unknown; events?: { attributes?: unknown }[] }): void {
    try {
      scrubRecord(span.attributes);
      for (const event of span.events ?? []) scrubRecord(event.attributes);
    } catch {
      // Never let telemetry hygiene break a request.
    }
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

// The same for log records (console output, exception text).
export class ScrubbingLogRecordProcessor {
  onEmit(record: { body?: unknown; attributes?: unknown }): void {
    try {
      if (typeof record.body === 'string' && record.body.includes('=')) {
        const cleaned = scrubSecrets(record.body);
        if (cleaned !== record.body) record.body = cleaned;
      }
      scrubRecord(record.attributes);
    } catch {
      // Never let telemetry hygiene break a request.
    }
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

// Attaches both scrubbers to the applicationinsights v3 shim. The shim has
// no public way to add processors (addTelemetryProcessor is a no-op that
// only logs "not supported"), but it builds its OpenTelemetry options from
// config.parseConfig() when start() runs - so wrapping that one method adds
// ours. Custom span processors run before the exporter's batch processor,
// so what they scrub is what gets sent. Must be called after setup() and
// before start(). Returns whether it took; if the library's internals ever
// change it simply does nothing (telemetry still works, unscrubbed).
export function installTelemetryScrubbers(appInsights: unknown): boolean {
  try {
    const config = (appInsights as { defaultClient?: { config?: { parseConfig?: unknown } } })?.defaultClient?.config;
    const original = config?.parseConfig;
    if (!config || typeof original !== 'function') return false;
    (config as { parseConfig: unknown }).parseConfig = function (this: unknown, ...args: unknown[]) {
      const options = (original as (...a: unknown[]) => Record<string, unknown>).apply(this, args);
      options.spanProcessors = [...((options.spanProcessors as unknown[]) ?? []), new ScrubbingSpanProcessor()];
      options.logRecordProcessors = [...((options.logRecordProcessors as unknown[]) ?? []), new ScrubbingLogRecordProcessor()];
      return options;
    };
    return true;
  } catch {
    return false;
  }
}
