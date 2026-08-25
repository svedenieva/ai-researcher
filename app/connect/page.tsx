'use client';

// "Connect your Claude" — the step the product was missing. /research told
// people the AiS connector had to be connected but never said where to, or
// with what, so the flagship feature only worked for whoever the admin had
// configured by hand.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiJson } from '@/lib/api';
import { useToast } from '../ui';
import styles from './connect.module.css';

interface ConnectInfo {
  email: string;
  endpoint: string;
  token: string | null;
}

function Copyable({ value, secret = false }: { value: string; secret?: boolean }) {
  const toast = useToast();
  const [shown, setShown] = useState(!secret);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast('Скопійовано');
    } catch {
      toast('Браузер не дав скопіювати — виділіть і скопіюйте вручну');
    }
  }, [value, toast]);

  return (
    <div className={styles.copyRow}>
      <code className={styles.code}>{shown ? value : '•'.repeat(Math.min(value.length, 24))}</code>
      {secret && (
        <button type="button" className={styles.ghost} onClick={() => setShown((s) => !s)}>
          {shown ? 'Сховати' : 'Показати'}
        </button>
      )}
      <button type="button" className={styles.ghost} onClick={copy}>
        Копіювати
      </button>
    </div>
  );
}

export default function ConnectPage() {
  const toast = useToast();
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson<ConnectInfo>('/api/connect')
      .then(setInfo)
      .catch((e) => toast(e instanceof Error ? e.message : 'Не вдалося завантажити дані підключення'))
      .finally(() => setLoading(false));
  }, [toast]);

  const cliCommand = info?.token
    ? `claude mcp add --transport http ais ${info.endpoint} --header "Authorization: Bearer ${info.token}"`
    : '';

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <Link href="/" className={styles.back}>← Таблиця</Link>
        <h1>Підключення конектора AiS</h1>
      </header>

      <p className={styles.lead}>
        Конектор дає вашому Claude доступ до цих баз: він зможе читати каталог і записувати
        результати досліджень прямо в базу. Дослідження йде на вашій підписці — ключі не потрібні.
      </p>

      {loading && <p className={styles.none}>Завантажуємо…</p>}

      {!loading && info && !info.token && (
        <section className={styles.warn}>
          <h2>Вашої адреси ще немає в списку конектора</h2>
          <p>
            Ви увійшли як <b>{info.email}</b>, але для цієї адреси не видано токен, тому підключити
            конектор поки що не можна.
          </p>
          <p>
            Попросіть власника проєкту додати вас у змінну <code>MCP_TOKENS</code> у налаштуваннях
            Vercel — формат <code>токен:пошта</code> через кому — і зробити редеплой.
          </p>
        </section>
      )}

      {!loading && info?.token && (
        <>
          <section className={styles.block}>
            <h2>1. Дані підключення</h2>
            <label className={styles.label}>Адреса конектора</label>
            <Copyable value={info.endpoint} />
            <label className={styles.label}>Ваш токен</label>
            <Copyable value={info.token} secret />
            <p className={styles.note}>
              Токен — це пароль: він відкриває ваші бази. Не пересилайте його і не вставляйте в адресний
              рядок — передавайте лише заголовком, як в інструкції нижче.
            </p>
          </section>

          <section className={styles.block}>
            <h2>2. Claude Desktop або claude.ai</h2>
            <ol className={styles.steps}>
              <li>Налаштування → <b>Конектори</b> → <b>Додати користувацький конектор</b>.</li>
              <li>Назва — наприклад <b>AiS</b>.</li>
              <li>Адреса — вставте адресу конектора зверху.</li>
              <li>
                У заголовках вкажіть <code>Authorization</code> зі значенням{' '}
                <code>Bearer &lt;ваш токен&gt;</code>.
              </li>
              <li>Збережіть і переконайтеся, що конектор увімкнено в чаті.</li>
            </ol>
          </section>

          <section className={styles.block}>
            <h2>3. Claude Code</h2>
            <p className={styles.note}>Однією командою в терміналі:</p>
            <Copyable value={cliCommand} secret />
          </section>

          <section className={styles.block}>
            <h2>4. Перевірка</h2>
            <p className={styles.note}>
              Запитайте свого Claude: <i>«покажи мої бази через AiS»</i>. Якщо він перелічить бази —
              усе працює, можна запускати <Link href="/research">дослідження</Link>.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
