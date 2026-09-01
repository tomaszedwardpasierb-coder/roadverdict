// Place at: src/lib/auth/safeRedirect.ts
//
// A redirect destination threaded through the magic-link sign-in flow
// (see request-link and verify routes) has to be validated at every
// boundary it crosses, not trusted just because an earlier step already
// checked it - the emailed link itself is plain, copyable text that
// could in principle be altered by anyone who sees it before the real
// recipient clicks it. The token is still what actually proves
// identity, so a tampered redirect could never grant access to someone
// else's account - but an unvalidated one could send a genuinely,
// legitimately signed-in person straight to an attacker-controlled URL
// right after they've proven who they are, which is the textbook
// open-redirect risk this exists to close off.
//
// A safe value must be a same-site, relative path: starts with exactly
// one leading slash, never two ("//host" is protocol-relative in a
// browser, pointing at a different host entirely, not this one), and
// never contains a scheme anywhere in it. The leading-slash check alone
// already guarantees this stays on-host once prefixed with APP_URL, but
// the scheme check stays in too - defense in depth against this ever
// being used a different way later (e.g. passed to redirect() directly,
// without APP_URL prefixed first).
const MAX_REDIRECT_LENGTH = 200;

// Browsers (per the WHATWG URL parser) strip ASCII tab/CR/LF from a URL
// before parsing it, and treat "\" as equivalent to "/" for any special
// scheme (http/https/ws/wss/ftp/file) when locating the authority (host)
// component. A value that only looks single-slash-relative in its raw
// form - e.g. "/\evil.com" or "/\t/evil.com" - can still resolve to a
// protocol-relative, different-host URL once a browser normalizes it, so
// normalization has to happen before the host-confusion check below runs.
const CONTROL_STRIP_PATTERN = /[\t\r\n]/g;

export function getSafeRedirectPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_REDIRECT_LENGTH) {
    return null;
  }
  const normalized = value.replace(CONTROL_STRIP_PATTERN, "");
  if (!normalized.startsWith("/")) {
    return null;
  }
  if (normalized[1] === "/" || normalized[1] === "\\") {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    return null;
  }
  return normalized;
}
