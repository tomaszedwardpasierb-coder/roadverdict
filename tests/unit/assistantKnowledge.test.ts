import { afterEach, describe, expect, it, vi } from "vitest";
import { getLivePrivacyPolicyText } from "@/lib/tracker/assistantKnowledge";

function htmlResponse(html: string, ok = true) {
  return { ok, text: async () => html };
}

// Real page structure is much longer than this in production - padded
// so the real >200-char-after-stripping threshold is exercised
// realistically rather than accidentally testing the length guard.
function longHtml(bodyHtml: string): string {
  return `<html><body>${bodyHtml}<p>${"Lorem ipsum dolor sit amet. ".repeat(20)}</p></body></html>`;
}

describe("getLivePrivacyPolicyText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches the configured privacy URL with hourly revalidation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse(longHtml("<p>We take privacy seriously.</p>")));
    vi.stubGlobal("fetch", fetchMock);

    await getLivePrivacyPolicyText();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/privacy");
    expect(init).toEqual({ next: { revalidate: 3600 } });
  });

  // A real discovery, not assumed going in: PRIVACY_POLICY_URL is a
  // top-level const, computed once when the module first loads - unlike
  // every other APP_URL-dependent route tested today, which reads
  // process.env.APP_URL fresh inside the function body on every call.
  // Setting the env var mid-test has no effect on an already-imported
  // module, so this needs a genuine fresh import via vi.resetModules()
  // to test at all. Low practical impact for a typical deployment
  // (APP_URL is set once at process start and never changes), but a
  // real, worth-knowing difference from the pattern used elsewhere.
  it("builds the privacy URL from APP_URL as it was when the module first loaded, not read fresh on every call", async () => {
    const originalAppUrl = process.env.APP_URL;
    vi.resetModules();
    process.env.APP_URL = "https://test.roadverdict.co.uk";
    const fresh = await import("@/lib/tracker/assistantKnowledge");
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse(longHtml("<p>x</p>")));
    vi.stubGlobal("fetch", fetchMock);

    await fresh.getLivePrivacyPolicyText();

    expect(fetchMock.mock.calls[0][0]).toBe("https://test.roadverdict.co.uk/privacy");
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
    vi.resetModules();
  });

  it("fails soft to null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("<p>x</p>", false)));
    expect(await getLivePrivacyPolicyText()).toBeNull();
  });

  it("fails soft to null when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    expect(await getLivePrivacyPolicyText()).toBeNull();
  });

  // A genuinely short/broken result (a near-empty page, a redirect to a
  // login wall, etc.) must not be handed to the assistant as if it were
  // the real policy text.
  it("fails soft to null when the stripped text is suspiciously short", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("<html><body><p>Too short.</p></body></html>")));
    expect(await getLivePrivacyPolicyText()).toBeNull();
  });

  it("strips script and style blocks entirely, including their content", async () => {
    const html = longHtml(`<script>alert('should not appear anywhere');</script><style>.x { color: red; }</style><p>Real policy text.</p>`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(html)));

    const result = await getLivePrivacyPolicyText();

    expect(result).not.toContain("alert");
    expect(result).not.toContain("color: red");
    expect(result).toContain("Real policy text.");
  });

  it("decodes common HTML entities", async () => {
    const html = longHtml(`<p>Terms &amp; conditions &quot;apply&quot; &#39;always&#39;&nbsp;here.</p>`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(html)));

    const result = await getLivePrivacyPolicyText();

    expect(result).toContain(`Terms & conditions "apply" 'always' here.`);
  });

  // The regex only converts the CLOSING tag (</p>) to a newline; the
  // following opening tag (<p>) is caught separately by the later,
  // generic tag-stripper and becomes a space - so a paragraph break is
  // genuinely "\n " (newline then space), not a clean newline alone.
  it("turns a paragraph break into a newline, confirming both paragraphs survive as separate lines", async () => {
    const html = longHtml(`<p>First paragraph.</p><p>Second paragraph.</p>`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(html)));

    const result = await getLivePrivacyPolicyText();

    expect(result).toMatch(/First paragraph\.\n\s*Second paragraph\./);
  });

  it("collapses excess blank lines down to a single gap", async () => {
    const html = longHtml(`<p>One.</p>\n\n\n\n<p>Two.</p>${"x".repeat(180)}`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(html)));

    const result = await getLivePrivacyPolicyText();

    expect(result).not.toMatch(/\n\s*\n\s*\n/);
  });
});