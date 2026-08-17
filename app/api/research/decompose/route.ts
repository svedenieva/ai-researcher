import { decompose } from '@/lib/research/decompose';

// Route wrapper around the shared decomposition logic (lib/research/decompose).
// The connector tool research_decompose calls the same function directly —
// without a self HTTP request, which in production hit the sign-in page.
export async function POST(request: Request): Promise<Response> {
  let prompt = '';
  try {
    const body = await request.json();
    prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  } catch {
    /* empty body */
  }

  if (!prompt.trim()) {
    return Response.json({ error: 'Пустой запрос' }, { status: 400 });
  }

  return Response.json(await decompose(prompt));
}
