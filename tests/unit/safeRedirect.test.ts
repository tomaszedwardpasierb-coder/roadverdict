import { describe, expect, it } from "vitest";
import { getSafeRedirectPath } from "@/lib/auth/safeRedirect";

// getSafeRedirectPath is the sole gate protecting the magic-link sign-in
// flow (and the admin broadcast-notification link) from open-redirect
// abuse - see the extensive comment atop the source file. It's tested
// here as an attacker would: every scheme/host-confusion trick a browser
// is known to normalize, not just the documented "starts with / and
// isn't //" happy path.

describe("getSafeRedirectPath", () => {
  // ---------------------------------------------------------------------
  // Type / shape guards
  // ---------------------------------------------------------------------

  it.each([undefined, null, 123, true, {}, [], new Date()])(
    "rejects non-string input (%j)",
    (value) => {
      expect(getSafeRedirectPath(value)).toBeNull();
    }
  );

  it("rejects an empty string", () => {
    expect(getSafeRedirectPath("")).toBeNull();
  });

  it("accepts a value exactly at the 200-character length limit", () => {
    const value = "/" + "a".repeat(199);
    expect(value.length).toBe(200);
    expect(getSafeRedirectPath(value)).toBe(value);
  });

  it("rejects a value one character past the 200-character length limit", () => {
    const value = "/" + "a".repeat(200);
    expect(value.length).toBe(201);
    expect(getSafeRedirectPath(value)).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Genuine, valid relative paths - the happy path
  // ---------------------------------------------------------------------

  it("returns a plain relative path unchanged", () => {
    expect(getSafeRedirectPath("/dashboard")).toBe("/dashboard");
  });

  it("returns a relative path with query string and fragment unchanged", () => {
    expect(getSafeRedirectPath("/bike/123?tab=history#top")).toBe("/bike/123?tab=history#top");
  });

  it("returns the root path unchanged", () => {
    expect(getSafeRedirectPath("/")).toBe("/");
  });

  // ---------------------------------------------------------------------
  // Missing leading slash
  // ---------------------------------------------------------------------

  it.each([
    "dashboard",
    "evil.com",
    "evil.com/phish",
    "http://evil.com",
    "https://evil.com",
    "HTTPS://evil.com",
  ])("rejects a value with no leading slash at all (%j)", (value) => {
    expect(getSafeRedirectPath(value)).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Protocol-relative ("//host") - the exact case the leading-// guard
  // names in the source comment.
  // ---------------------------------------------------------------------

  it.each([
    "//evil.com",
    "//evil.com/phish",
    "///evil.com",
    "//evil.com\\@roadverdict.co.uk",
  ])("rejects a protocol-relative value (%j)", (value) => {
    expect(getSafeRedirectPath(value)).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Scheme-prefixed values - can never actually reach the scheme regex
  // because the leading-slash guard above already rejects anything not
  // starting with a literal "/", and every scheme name starts with a
  // letter. Documented here as a deliberate observation, not a bug: the
  // regex is genuine defense-in-depth for a future caller (per the
  // source comment), just not reachable through this function today.
  // ---------------------------------------------------------------------

  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "mailto:evil@evil.com"])(
    "rejects a bare scheme value with no leading slash (%j)",
    (value) => {
      expect(getSafeRedirectPath(value)).toBeNull();
    }
  );

  // ===========================================================================
  // Browser URL-normalization bypasses - FIXED.
  //
  // getSafeRedirectPath's host-confusion defense used to be a literal
  // `startsWith("//")` check only. It didn't strip, or account for, the
  // ASCII tab/newline characters that the WHATWG URL parser (i.e. every
  // browser) unconditionally strips from a URL before parsing it, nor the
  // backslash character that the same parser treats as equivalent to "/"
  // for any "special" scheme (http/https/ws/wss/ftp/file) when deciding
  // where the authority (host) component starts.
  //
  // Concretely, these used to bypass the "//" check and be returned as if
  // they were safe, same-site paths:
  //   "/\evil.com"     -> after backslash normalization, a browser parses
  //                        this exactly like "//evil.com".
  //   "/\t/evil.com"    -> the browser deletes the tab entirely before
  //                        parsing, leaving literally "//evil.com".
  //   "/\n/evil.com"    -> same, via the stripped newline.
  //
  // This was exploitable in src/app/login/page.tsx (around line 48), which
  // uses this function's return value completely unprefixed as a raw
  // `window.location.href` navigation target for the demo sign-in flow -
  // unlike every other caller, which prefixes the result with APP_URL
  // before it could ever be reinterpreted. The source now strips
  // tab/CR/LF and checks the character immediately after the leading
  // slash for "/" or "\" before returning, closing the gap for every
  // caller regardless of whether it happens to prefix the result.
  // ===========================================================================

  it("rejects the backslash open-redirect trick ('/\\evil.com')", () => {
    // A browser treats "\" as equivalent to "/" for special schemes, so
    // this parses identically to the already-blocked "//evil.com".
    expect(getSafeRedirectPath("/\\evil.com")).toBeNull();
  });

  it("rejects a tab-character open-redirect trick ('/\\t/evil.com')", () => {
    // Browsers strip ASCII tab/newline from a URL before parsing it, so
    // this literal string parses identically to "//evil.com".
    expect(getSafeRedirectPath("/\t/evil.com")).toBeNull();
  });

  it("rejects a newline-character open-redirect trick ('/\\n/evil.com')", () => {
    expect(getSafeRedirectPath("/\n/evil.com")).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Encoded variants are NOT equivalent to the raw-character tricks above
  // (percent-decoding of a path segment happens after, not before, host
  // detection) - confirmed here to behave like any other ordinary path.
  // ---------------------------------------------------------------------

  it("treats a percent-encoded backslash as an ordinary path character, not a host separator", () => {
    expect(getSafeRedirectPath("/%5Cevil.com")).toBe("/%5Cevil.com");
  });

  it("rejects a percent-encoded leading slash the same as any other non-leading-slash value", () => {
    // "%2F" is not a literal "/", so this correctly fails the leading-slash check.
    expect(getSafeRedirectPath("%2Fdashboard")).toBeNull();
  });
});
