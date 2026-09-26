// Thin wrapper over fetch for the web app's existing API routes. The app
// has no cookie jar - a signed-in request carries the session token as
// `Authorization: Bearer <token>`, which the server treats exactly like
// the web's session cookie.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://roadverdict.co.uk';

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string };

const NETWORK_ERROR = "Can't reach RoadVerdict. Check your connection and try again.";

export async function apiFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    token?: string | null;
    headers?: Record<string, string>;
  } = {}
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Some routes answer with an empty body - that's fine for ok responses.
  }

  if (!response.ok) {
    const message = (data as { error?: unknown } | null)?.error;
    return {
      ok: false,
      status: response.status,
      error: typeof message === 'string' ? message : 'Something went wrong. Please try again.',
    };
  }
  return { ok: true, status: response.status, data: data as T };
}

// Session tokens are `${base64url(email)}.${secret}` - the email half
// isn't secret, so the app reads it back for display rather than
// storing it separately.
export function emailFromToken(token: string): string | null {
  const encoded = token.split('.')[0];
  if (!encoded) return null;
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return decodeURIComponent(
      Array.from(atob(padded), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
  } catch {
    return null;
  }
}
