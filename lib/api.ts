// Thin fetch wrapper. Parses the JSON body and throws a readable Error when the
// request fails, so callers can surface it (a toast) instead of leaving an
// unhandled rejection / raw error in the console.
export async function apiJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new Error('Нет соединения с сервером');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body — fine for some 204s */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error;
    throw new Error(msg || `Ошибка сервера (${res.status})`);
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
