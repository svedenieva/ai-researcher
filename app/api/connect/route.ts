import { currentEmail } from '@/lib/current-user';
import { tokenForEmail } from '@/lib/mcp/tokens';

export const dynamic = 'force-dynamic';

// What the signed-in person needs to wire their own Claude to this app:
// the connector URL and THEIR token. A token is a live credential, so this
// route hands out only the caller's own — never the list — and the response
// is marked no-store so it doesn't sit in a shared cache.
export async function GET(request: Request): Promise<Response> {
  const me = await currentEmail();
  if (!me) return Response.json({ error: 'Could not identify the user' }, { status: 401 });

  const token = tokenForEmail(me);
  const endpoint = `${new URL(request.url).origin}/api/mcp`;

  return Response.json(
    {
      email: me,
      endpoint,
      token, // null when this address isn't in MCP_TOKENS yet
    },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
