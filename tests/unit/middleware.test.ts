import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

function request(path = "/dashboard"): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe("middleware", () => {
  it("sets a Content-Security-Policy header containing every required directive", () => {
    const response = middleware(request());
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    for (const directive of [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ]) {
      expect(csp).toContain(directive);
    }
  });

  it("includes a script-src directive with a nonce matching the x-nonce request header it forwards", () => {
    const response = middleware(request());
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    const nonceMatch = csp.match(/script-src 'self' 'nonce-([^']+)'/);
    expect(nonceMatch).not.toBeNull();
    const nonceFromCsp = nonceMatch?.[1];
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonceFromCsp);
  });

  it("generates a different nonce on every request, rather than reusing one across requests", () => {
    const first = middleware(request()).headers.get("Content-Security-Policy");
    const second = middleware(request()).headers.get("Content-Security-Policy");
    expect(first).not.toEqual(second);
  });
});
