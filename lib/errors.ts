// What the caller is allowed to learn about a server-side failure: that it
// happened. The details — relation names, the project's address, whatever the
// driver put in the string, and in one observed case another person's email —
// go to the server log instead.
export function publicError(e: unknown, fallback: string, context: string): string {
  console.error(`${context}:`, e);
  return fallback;
}
