// Thin fetch wrapper. Parses the JSON body and throws a readable Error when the
// request fails, so callers can surface it (a toast) instead of leaving an
// unhandled rejection / raw error in the console.

/** Carries the HTTP status so callers can tell "gone" from "broken". */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new ApiError('No connection to the server', 0);
  }

  // An expired session makes the middleware redirect even /api calls to /login;
  // fetch follows the redirect and hands back an HTML page with status 200.
  // Without this check the caller receives null where it expected data and
  // dies on the next property access — the user saw a raw
  // "Cannot read properties of null" instead of "sign in again".
  if (res.redirected && new URL(res.url).pathname.startsWith('/login')) {
    throw new ApiError('Your session expired - sign in again', 401);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body — fine for some 204s */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error;
    throw new ApiError(msg || `Server error (${res.status})`, res.status);
  }
  return body as T;
}

// convenience for JSON mutations (POST / PATCH / DELETE)
export function apiSend<T = unknown>(url: string, method: string, data: unknown): Promise<T> {
  return apiJson<T>(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
