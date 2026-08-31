// Standalone stub — the vibe editor only calls apiFetch for optional
// server-side session signals (deleted-signatures). No backend here.
export async function apiFetch<T>(_path: string, _options: RequestInit = {}): Promise<T> {
  return {} as T;
}
