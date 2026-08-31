'use client';

// "Connect your Claude" — the step the product was missing. /research told
// people the AiS connector had to be connected but never said where to, or
// with what, so the flagship feature only worked for whoever the admin had
// configured by hand.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiJson } from '@/lib/api';
import { useToast } from '../ui';
import { useLang } from '../lang-provider';
import styles from './connect.module.css';

// Local UI copy for this page, keyed per language (Ukrainian is the source).
// URLs, tokens, CLI commands, env-var names (MCP_TOKENS) and product names stay
// literal in the JSX — only human-facing text lives here.
const S = {
  uk: {
    copied: 'Скопійовано',
    copyFailed: 'Браузер не дав скопіювати — виділіть і скопіюйте вручну',
    hide: 'Сховати',
    show: 'Показати',
    copy: 'Копіювати',
    loadError: 'Не вдалося завантажити дані підключення',
    back: 'Таблиця',
    title: 'Підключення конектора AiS',
    lead: 'Конектор дає вашому Claude доступ до цих баз: він зможе читати каталог і записувати результати досліджень прямо в базу. Дослідження йде на вашій підписці — ключі не потрібні.',
    loading: 'Завантажуємо…',
    notListedTitle: 'Вашої адреси ще немає в списку конектора',
    loggedInA: 'Ви увійшли як ',
    loggedInB: ', але для цієї адреси не видано токен, тому підключити конектор поки що не можна.',
    askOwnerA: 'Попросіть власника проєкту додати вас у змінну ',
    askOwnerB: ' у налаштуваннях Vercel — формат ',
    formatCode: 'токен:пошта',
    askOwnerC: ' через кому — і зробити редеплой.',
    block1Title: '1. Дані підключення',
    labelEndpoint: 'Адреса конектора',
    labelToken: 'Ваш токен',
    tokenNote: 'Токен — це пароль: він відкриває ваші бази. Не пересилайте його і не вставляйте в адресний рядок — передавайте лише заголовком, як в інструкції нижче.',
    block2Title: '2. Claude Desktop або claude.ai',
    s1Settings: 'Налаштування',
    s1Connectors: 'Конектори',
    s1AddCustom: 'Додати користувацький конектор',
    s2Name: 'Назва — наприклад',
    s3: 'Адреса — вставте адресу конектора зверху.',
    s4a: 'У заголовках вкажіть',
    s4b: 'зі значенням',
    s4YourToken: 'ваш токен',
    s5: 'Збережіть і переконайтеся, що конектор увімкнено в чаті.',
    block3Title: '3. Claude Code',
    cliNote: 'Однією командою в терміналі:',
    block4Title: '4. Перевірка',
    verifyA: 'Запитайте свого Claude:',
    verifyQuote: '«покажи мої бази через AiS»',
    verifyB: '. Якщо він перелічить бази — усе працює, можна запускати',
    verifyLink: 'дослідження',
  },
  ru: {
    copied: 'Скопировано',
    copyFailed: 'Браузер не дал скопировать — выделите и скопируйте вручную',
    hide: 'Скрыть',
    show: 'Показать',
    copy: 'Копировать',
    loadError: 'Не удалось загрузить данные подключения',
    back: 'Таблица',
    title: 'Подключение коннектора AiS',
    lead: 'Коннектор даёт вашему Claude доступ к этим базам: он сможет читать каталог и записывать результаты исследований прямо в базу. Исследование идёт на вашей подписке — ключи не нужны.',
    loading: 'Загружаем…',
    notListedTitle: 'Вашего адреса ещё нет в списке коннектора',
    loggedInA: 'Вы вошли как ',
    loggedInB: ', но для этого адреса не выдан токен, поэтому подключить коннектор пока нельзя.',
    askOwnerA: 'Попросите владельца проекта добавить вас в переменную ',
    askOwnerB: ' в настройках Vercel — формат ',
    formatCode: 'токен:почта',
    askOwnerC: ' через запятую — и сделать редеплой.',
    block1Title: '1. Данные подключения',
    labelEndpoint: 'Адрес коннектора',
    labelToken: 'Ваш токен',
    tokenNote: 'Токен — это пароль: он открывает ваши базы. Не пересылайте его и не вставляйте в адресную строку — передавайте только заголовком, как в инструкции ниже.',
    block2Title: '2. Claude Desktop или claude.ai',
    s1Settings: 'Настройки',
    s1Connectors: 'Коннекторы',
    s1AddCustom: 'Добавить пользовательский коннектор',
    s2Name: 'Название — например',
    s3: 'Адрес — вставьте адрес коннектора сверху.',
    s4a: 'В заголовках укажите',
    s4b: 'со значением',
    s4YourToken: 'ваш токен',
    s5: 'Сохраните и убедитесь, что коннектор включён в чате.',
    block3Title: '3. Claude Code',
    cliNote: 'Одной командой в терминале:',
    block4Title: '4. Проверка',
    verifyA: 'Спросите своего Claude:',
    verifyQuote: '«покажи мои базы через AiS»',
    verifyB: '. Если он перечислит базы — всё работает, можно запускать',
    verifyLink: 'исследование',
  },
  en: {
    copied: 'Copied',
    copyFailed: 'The browser blocked copying — select and copy it manually',
    hide: 'Hide',
    show: 'Show',
    copy: 'Copy',
    loadError: 'Could not load connection details',
    back: 'Table',
    title: 'Connect the AiS connector',
    lead: 'The connector gives your Claude access to these bases: it can read the catalog and write research results straight into a base. Research runs on your subscription — no keys needed.',
    loading: 'Loading…',
    notListedTitle: 'Your address is not on the connector list yet',
    loggedInA: 'You are signed in as ',
    loggedInB: ', but no token has been issued for this address, so the connector cannot be connected yet.',
    askOwnerA: 'Ask the project owner to add you to the ',
    askOwnerB: ' variable in the Vercel settings — format ',
    formatCode: 'token:email',
    askOwnerC: ' separated by a comma — and redeploy.',
    block1Title: '1. Connection details',
    labelEndpoint: 'Connector address',
    labelToken: 'Your token',
    tokenNote: 'The token is a password: it opens your bases. Do not forward it or paste it into the address bar — pass it only as a header, as in the instructions below.',
    block2Title: '2. Claude Desktop or claude.ai',
    s1Settings: 'Settings',
    s1Connectors: 'Connectors',
    s1AddCustom: 'Add custom connector',
    s2Name: 'Name — for example',
    s3: 'Address — paste the connector address from above.',
    s4a: 'In the headers, set',
    s4b: 'with the value',
    s4YourToken: 'your token',
    s5: 'Save and make sure the connector is enabled in the chat.',
    block3Title: '3. Claude Code',
    cliNote: 'With a single command in the terminal:',
    block4Title: '4. Check',
    verifyA: 'Ask your Claude:',
    verifyQuote: '“show my bases via AiS”',
    verifyB: '. If it lists the bases — everything works, and you can start',
    verifyLink: 'research',
  },
} as const;

interface ConnectInfo {
  email: string;
  endpoint: string;
  token: string | null;
}

function Copyable({ value, secret = false }: { value: string; secret?: boolean }) {
  const toast = useToast();
  const { lang } = useLang();
  const [shown, setShown] = useState(!secret);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast(S[lang].copied);
    } catch {
      toast(S[lang].copyFailed);
    }
  }, [value, toast, lang]);

  return (
    <div className={styles.copyRow}>
      <code className={styles.code}>{shown ? value : '•'.repeat(Math.min(value.length, 24))}</code>
      {secret && (
        <button type="button" className={styles.ghost} onClick={() => setShown((s) => !s)}>
          {shown ? S[lang].hide : S[lang].show}
        </button>
      )}
      <button type="button" className={styles.ghost} onClick={copy}>
        {S[lang].copy}
      </button>
    </div>
  );
}

export default function ConnectPage() {
  const toast = useToast();
  const { lang } = useLang();
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson<ConnectInfo>('/api/connect')
      .then(setInfo)
      .catch((e) => toast(e instanceof Error ? e.message : S[lang].loadError))
      .finally(() => setLoading(false));
  }, [toast, lang]);

  const cliCommand = info?.token
    ? `claude mcp add --transport http ais ${info.endpoint} --header "Authorization: Bearer ${info.token}"`
    : '';

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <Link href="/" className={styles.back}>← {S[lang].back}</Link>
        <h1>{S[lang].title}</h1>
      </header>

      <p className={styles.lead}>
        {S[lang].lead}
      </p>

      {loading && <p className={styles.none}>{S[lang].loading}</p>}

      {!loading && info && !info.token && (
        <section className={styles.warn}>
          <h2>{S[lang].notListedTitle}</h2>
          <p>
            {S[lang].loggedInA}<b>{info.email}</b>{S[lang].loggedInB}
          </p>
          <p>
            {S[lang].askOwnerA}<code>MCP_TOKENS</code>{S[lang].askOwnerB}<code>{S[lang].formatCode}</code>{S[lang].askOwnerC}
          </p>
        </section>
      )}

      {!loading && info?.token && (
        <>
          <section className={styles.block}>
            <h2>{S[lang].block1Title}</h2>
            <label className={styles.label}>{S[lang].labelEndpoint}</label>
            <Copyable value={info.endpoint} />
            <label className={styles.label}>{S[lang].labelToken}</label>
            <Copyable value={info.token} secret />
            <p className={styles.note}>
              {S[lang].tokenNote}
            </p>
          </section>

          <section className={styles.block}>
            <h2>{S[lang].block2Title}</h2>
            <ol className={styles.steps}>
              <li>{S[lang].s1Settings} → <b>{S[lang].s1Connectors}</b> → <b>{S[lang].s1AddCustom}</b>.</li>
              <li>{S[lang].s2Name} <b>AiS</b>.</li>
              <li>{S[lang].s3}</li>
              <li>
                {S[lang].s4a} <code>Authorization</code> {S[lang].s4b}{' '}
                <code>Bearer &lt;{S[lang].s4YourToken}&gt;</code>.
              </li>
              <li>{S[lang].s5}</li>
            </ol>
          </section>

          <section className={styles.block}>
            <h2>{S[lang].block3Title}</h2>
            <p className={styles.note}>{S[lang].cliNote}</p>
            <Copyable value={cliCommand} secret />
          </section>

          <section className={styles.block}>
            <h2>{S[lang].block4Title}</h2>
            <p className={styles.note}>
              {S[lang].verifyA} <i>{S[lang].verifyQuote}</i>{S[lang].verifyB}{' '}
              <Link href="/research">{S[lang].verifyLink}</Link>.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
