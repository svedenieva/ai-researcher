import { decompose } from '@/lib/research/decompose';

// Роут-обёртка над общей логикой декомпозиции (lib/research/decompose).
// Ту же функцию напрямую зовёт инструмент коннектора research_decompose —
// без самозапроса по HTTP, который на проде упирался в страницу входа.
export async function POST(request: Request): Promise<Response> {
  let prompt = '';
  try {
    const body = await request.json();
    prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  } catch {
    /* пустое тело */
  }

  if (!prompt.trim()) {
    return Response.json({ error: 'Пустой запрос' }, { status: 400 });
  }

  return Response.json(await decompose(prompt));
}
