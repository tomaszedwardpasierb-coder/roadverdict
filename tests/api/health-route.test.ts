// Azure's health check pings /health every ~30 seconds: it must answer 200
// instantly, with plain text, and never touch anything slow.
import { describe, expect, it } from "vitest";
import { GET } from "@/app/health/route";

describe("GET /health", () => {
  it("answers 200 'ok' as uncached plain text", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
