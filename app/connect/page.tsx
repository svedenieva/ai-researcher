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
      toast('Скопировано');
    } catch {
      toast('Браузер не дал скопировать — выделите и скопируйте вручную');
    }
  }, [value, toast]);

  return (
    <div className={styles.copyRow}>
      <code className={styles.code}>{shown ? value : '•'.repeat(Math.min(value.length, 24))}</code>
      {secret && (
        <button type="button" className={styles.ghost} onClick={() => setShown((s) => !s)}>
          {shown ? 'Скрыть' : 'Показать'}
        </button>
      )}
      <button type="button" className={styles.ghost} onClick={copy}>
        Копировать
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
      .catch((e) => toast(e instanceof Error ? e.message : 'Не удалось загрузить данные подключения'))
      .finally(() => setLoading(false));
  }, [toast]);

  const cliCommand = info?.token
    ? `claude mcp add --transport http ais ${info.endpoint} --header "Authorization: Bearer ${info.token}"`
    : '';

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <Link href="/" className={styles.back}>← Таблица</Link>
        <h1>Подключение коннектора AiS</h1>
      </header>

      <p className={styles.lead}>
        Коннектор даёт вашему Claude доступ к этим базам: он сможет читать каталог и записывать
        результаты исследований прямо в базу. Исследование идёт на вашей подписке — ключи не нужны.
      </p>

      {loading && <p className={styles.none}>Загружаем…</p>}

      {!loading && info && !info.token && (
        <section className={styles.warn}>
          <h2>Ваш адрес ещё не в списке коннектора</h2>
          <p>
            Вы вошли как <b>{info.email}</b>, но для этого адреса не выдан токен, поэтому подключить
            коннектор пока нельзя.
          </p>
          <p>
            Попросите владельца проекта добавить вас в переменную <code>MCP_TOKENS</code> в настройках
            Vercel — формат <code>токен:почта</code> через запятую — и сделать редеплой.
          </p>
        </section>
      )}

      {!loading && info?.token && (
        <>
          <section className={styles.block}>
            <h2>1. Данные подключения</h2>
            <label className={styles.label}>Адрес коннектора</label>
            <Copyable value={info.endpoint} />
            <label className={styles.label}>Ваш токен</label>
            <Copyable value={info.token} secret />
            <p className={styles.note}>
              Токен — это пароль: он открывает ваши базы. Не пересылайте его и не вставляйте в адресную
              строку — передавайте только заголовком, как в инструкции ниже.
            </p>
          </section>

          <section className={styles.block}>
            <h2>2. Claude Desktop или claude.ai</h2>
            <ol className={styles.steps}>
              <li>Настройки → <b>Коннекторы</b> → <b>Добавить пользовательский коннектор</b>.</li>
              <li>Название — например <b>AiS</b>.</li>
              <li>Адрес — вставьте адрес коннектора сверху.</li>
              <li>
                В заголовках укажите <code>Authorization</code> со значением{' '}
                <code>Bearer &lt;ваш токен&gt;</code>.
              </li>
              <li>Сохраните и убедитесь, что коннектор включён в чате.</li>
            </ol>
          </section>

          <section className={styles.block}>
            <h2>3. Claude Code</h2>
            <p className={styles.note}>Одной командой в терминале:</p>
            <Copyable value={cliCommand} secret />
          </section>

          <section className={styles.block}>
            <h2>4. Проверка</h2>
            <p className={styles.note}>
              Спросите своего Claude: <i>«покажи мои базы через AiS»</i>. Если он перечислит базы —
              всё работает, можно запускать <Link href="/research">исследование</Link>.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
