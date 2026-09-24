import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../src/middleware";

function request(path = "/dashboard", host = "localhost", cookies: Record<string, string> = {}): NextRequest {
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  return new NextRequest(`http://${host}${path}`, { headers: { host, ...(cookieHeader ? { cookie: cookieHeader } : {}) } });
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

  it("keeps the strict nonce policy on per-request routes, including sign-in and the API", () => {
    for (const path of ["/login", "/login/verify-2fa", "/api/viewer", "/pro", "/tomasz/login"]) {
      const csp = middleware(request(path)).headers.get("Content-Security-Policy") ?? "";
      expect(csp, path).toMatch(/script-src 'self' 'nonce-[^']+'/);
      expect(csp, path).not.toContain("'unsafe-inline'; default-src");
    }
  });

  it("gives prerendered public pages a nonce-free policy, since static HTML can't carry a per-request nonce - but keeps every other directive strict", () => {
    for (const path of ["/quote-checker", "/cars", "/guides/buying-a-used-car", "/some-typo"]) {
      const response = middleware(request(path));
      const csp = response.headers.get("Content-Security-Policy") ?? "";
      expect(csp, path).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp, path).not.toContain("nonce-");
      expect(csp, path).toContain("object-src 'none'");
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(response.headers.get("x-middleware-request-x-nonce"), path).toBeNull();
    }
  });

  it("redirects www.roadverdict.co.uk to the https apex domain, preserving the path and query", () => {
    const response = middleware(request("/motorcycles?ref=x", "www.roadverdict.co.uk"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://roadverdict.co.uk/motorcycles?ref=x");
  });

  // Behind Azure's proxy the Host header is the public name but request.url
  // carries the app's internal port - the redirect must not inherit it.
  it("drops the internal port from request.url when redirecting www to the apex", () => {
    const req = new NextRequest("https://www.roadverdict.co.uk:8080/quote-checker", { headers: { host: "www.roadverdict.co.uk" } });
    const response = middleware(req);
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://roadverdict.co.uk/quote-checker");
  });

  it("does not redirect the apex domain itself", () => {
    const response = middleware(request("/motorcycles", "roadverdict.co.uk"));
    expect(response.status).not.toBe(308);
  });

  it("sends a visitor with a session cookie from the homepage straight to the dashboard", () => {
    const response = middleware(request("/", "localhost", { session: "abc.def" }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("serves the homepage to visitors without a session cookie, and only redirects the homepage itself", () => {
    expect(middleware(request("/")).status).not.toBe(307);
    expect(middleware(request("/quote-checker", "localhost", { session: "abc.def" })).status).not.toBe(307);
  });

  it("mirrors the httpOnly session cookie into a client-readable marker, and removes the marker once the session cookie is gone", () => {
    const withSession = middleware(request("/quote-checker", "localhost", { session: "abc.def" }));
    expect(withSession.cookies.get("rv_auth")?.value).toBe("1");

    const noChangeNeeded = middleware(request("/quote-checker", "localhost", { session: "abc.def", rv_auth: "1" }));
    expect(noChangeNeeded.cookies.get("rv_auth")).toBeUndefined();

    const sessionGone = middleware(request("/quote-checker", "localhost", { rv_auth: "1" }));
    expect(sessionGone.headers.get("set-cookie") ?? "").toMatch(/rv_auth=;/);

    const anonymous = middleware(request("/quote-checker"));
    expect(anonymous.headers.get("set-cookie")).toBeNull();
  });

  it("mirrors the impersonation cookie into its own marker the same way", () => {
    const response = middleware(request("/dashboard", "localhost", { impersonating_as: "user@example.com" }));
    expect(response.cookies.get("rv_imp")?.value).toBe("1");
  });
});
