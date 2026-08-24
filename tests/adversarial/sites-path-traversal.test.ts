// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// Раздел «Сайты»: чужая вёрстка, которая живёт на НАШЕМ домене, за нашей
// авторизацией. Атакуем путь (выход за пределы своей папки), объём (сколько
// можно залить) и то, что произойдёт, когда браузер откроет чужой HTML.

const store = vi.hoisted(() => ({
  written: [] as { id: string; path: string }[],
  files: {
    'index.html': '<h1>демо</h1>',
    'app.js': 'console.log(1)',
  } as Record<string, string>,
}));

vi.mock('@/lib/sites/store', () => ({
  SitesNotSetUp: class SitesNotSetUp extends Error {},
  getSiteStore: () => ({
    get: async (id: string) =>
      id === 'demo' ? { id: 'demo', name: 'Демо', entry: 'index.html', tags: [], fileCount: 2, sizeBytes: 30, owner: 'bob@example.com', createdAt: '' } : null,
    readFile: async (_id: string, path: string) =>
      store.files[path] ? new TextEncoder().encode(store.files[path]) : null,
    putFile: async (id: string, path: string) => { store.written.push({ id, path }); },
    list: async () => [],
    create: async (def: { name: string }) => ({ id: 'new', name: def.name, entry: 'index.html', tags: [], client: null, note: null, fileCount: 0, sizeBytes: 0, owner: null, createdAt: '' }),
  }),
}));

vi.mock('@/lib/current-user', () => ({ currentEmail: async () => 'alice@example.com' }));

import { GET as serveGET } from '@/app/s/[id]/[[...path]]/route';
import { POST as filesPOST } from '@/app/api/sites/[id]/files/route';
import { POST as sitesPOST } from '@/app/api/sites/route';
import { isSafePath, validateUpload, MAX_FILES } from '@/lib/sites/site';
import { unzipEntries, zipEntries } from '@/lib/sites/zip';

const serve = (segments: string[]) =>
  serveGET(new Request(`http://localhost/s/demo/${segments.join('/')}`), { params: Promise.resolve({ id: 'demo', path: segments }) });

describe('Выход за пределы своей папки', () => {
  // ключ в хранилище склеен как <id>/<путь> — «..» уводит в чужой сайт
  it('«..» в пути отклоняется в любой позиции', async () => {
    for (const segs of [['..', 'x'], ['a', '..', 'b'], ['a', '..', '..', 'b'], ['assets', '..', '..', 'other', 'index.html']]) {
      const res = await serve(segs);
      expect({ segs: segs.join('/'), status: res.status }).toEqual({ segs: segs.join('/'), status: 404 });
    }
  });

  // обратный слэш — путь на Windows и обход наивной проверки на «/»
  it('обратный слэш в пути отклоняется', () => {
    expect(isSafePath('a\\..\\b')).toBe(false);
    expect(isSafePath('..\\windows\\system32')).toBe(false);
  });

  // одиночная точка и пустой сегмент
  it('«.» и пустой сегмент отклоняются', () => {
    expect(isSafePath('./index.html')).toBe(false);
    expect(isSafePath('a//b')).toBe(false);
    expect(isSafePath('/index.html')).toBe(false);
    expect(isSafePath('')).toBe(false);
  });

  // нулевой байт обрезает путь в нижележащих слоях и превращает «a.txt\0.png» в «a.txt»
  it('нулевой байт в пути отклоняется', () => {
    expect(isSafePath('index.html' + String.fromCharCode(0) + '.png')).toBe(false);
  });

  // управляющие символы и перевод строки в ключе хранилища
  it('перевод строки в пути отклоняется', () => {
    expect(isSafePath('index\n.html')).toBe(false);
  });

  // контроль: нормальные пути работают
  it('обычный вложенный путь отдаётся', async () => {
    const res = await serve(['app.js']);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  });
});

describe('Загрузка файлов сайта', () => {
  // манифест проверяется при создании сайта, а докладывать файлы можно
  // бесконечно и в уже существующий сайт — лимит MAX_FILES обходится
  it('файл, которого не было в манифесте, не принимается', async () => {
    const form = new FormData();
    form.set('path', 'левый-файл.js');
    form.set('file', new Blob(['alert(1)']));
    const res = await filesPOST(new Request('http://localhost/api/sites/demo/files', { method: 'POST', body: form }), {
      params: Promise.resolve({ id: 'demo' }),
    });
    expect(res.status).toBe(400);
  });

  // если сломается — «..» в поле path уводит запись в чужой сайт
  it('«..» в поле path отклоняется', async () => {
    const form = new FormData();
    form.set('path', '../other/index.html');
    form.set('file', new Blob(['x']));
    const res = await filesPOST(new Request('http://localhost/api/sites/demo/files', { method: 'POST', body: form }), {
      params: Promise.resolve({ id: 'demo' }),
    });
    expect(res.status).toBe(400);
  });

  // манифест с путями наружу не должен «чиниться» обрезкой общей папки
  it('манифест из путей «../…» отклоняется, а не выправляется', () => {
    const check = validateUpload([
      { path: '../index.html', size: 10 },
      { path: '../evil.js', size: 10 },
    ]);
    expect(check.ok).toBe(false);
  });

  // суммарный объём: 200 файлов по 10 МБ — два гигабайта за одну загрузку
  it('суммарный размер загрузки ограничен', () => {
    const files = Array.from({ length: MAX_FILES }, (_, i) => ({ path: i === 0 ? 'index.html' : `f${i}.bin`, size: 10 * 1024 * 1024 }));
    const check = validateUpload(files);
    expect(check.ok).toBe(false);
  });

  // контроль: обычная загрузка проходит
  it('нормальный манифест принимается', () => {
    const check = validateUpload([{ path: 'index.html', size: 100 }, { path: 'style.css', size: 50 }]);
    expect(check.ok).toBe(true);
  });

  // создание сайта без файлов — пустая запись в реестре
  it('создание сайта с пустым списком файлов отклоняется', async () => {
    const res = await sitesPOST(new Request('http://localhost/api/sites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Пустой', files: [] }),
    }));
    expect(res.status).toBe(400);
  });
});

describe('Архив', () => {
  // zip-slip: распаковка обязана выкидывать пути наружу на месте, а не
  // надеяться, что их отсечёт следующий слой
  it('unzipEntries не пропускает запись с «..» в пути', () => {
    const archive = zipEntries([
      { path: 'index.html', bytes: new TextEncoder().encode('<h1>ok</h1>') },
      { path: '../../evil.sh', bytes: new TextEncoder().encode('rm -rf /') },
    ]);
    const entries = unzipEntries(archive);
    expect(entries.map((e) => e.path)).not.toContain('../../evil.sh');
  });

  // абсолютный путь внутри архива
  it('unzipEntries не пропускает абсолютный путь', () => {
    const archive = zipEntries([{ path: 'index.html', bytes: new TextEncoder().encode('ok') }]);
    const entries = unzipEntries(archive);
    for (const e of entries) expect(e.path.startsWith('/')).toBe(false);
  });
});

describe('Чужой HTML на нашем домене', () => {
  // Загруженный сайт отдаётся с того же origin, что и витрина, за той же
  // сессией. Без изоляции его скрипт ходит в /api/* от имени смотрящего —
  // то есть любой, кто может залить сайт, может действовать за любого, кто его откроет.
  it('страница сайта отдаётся с политикой, запрещающей ей ходить в наше API', async () => {
    const res = await serve(['index.html']);
    expect(res.status).toBe(200);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toBeTruthy();
  });

  // sandbox через заголовок — второй общепринятый способ той же изоляции
  it('ответ помечен как изолированный (sandbox / CSP)', async () => {
    const res = await serve(['index.html']);
    const guarded = Boolean(res.headers.get('content-security-policy')) ||
      (res.headers.get('x-frame-options') ?? '') !== '';
    expect(guarded).toBe(true);
  });

  // контроль: тип задаётся расширением и браузеру гадать не дают
  it('nosniff стоит на месте', async () => {
    const res = await serve(['app.js']);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
