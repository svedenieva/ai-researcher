import type { MindSheetStrings } from '@aivocado/mindsheet';

// Three interface languages. Ukrainian is the default. Data (names, verdicts,
// notes) is not translated — that's user content, only the UI is.
export type Lang = 'uk' | 'ru' | 'en';
export const LANGS: { id: Lang; short: string }[] = [
  { id: 'uk', short: 'УКР' },
  { id: 'ru', short: 'РУС' },
  { id: 'en', short: 'ENG' },
];
export const DEFAULT_LANG: Lang = 'uk';

// ── labels for the home page and its components ────────────────────────────
type Tri = Record<Lang, string>;
type TriFn = Record<Lang, (...a: never[]) => string>;

const UI = {
  // header / page.tsx
  csvHint: {
    uk: 'Вивантажити те, що зараз на екрані, у CSV (RFC 4180)',
    ru: 'Выгрузить то, что сейчас на экране, в CSV (RFC 4180)',
    en: 'Export what’s on screen to CSV (RFC 4180)',
  },
  sites: { uk: 'Сайти', ru: 'Сайты', en: 'Sites' },
  trash: { uk: 'Кошик', ru: 'Корзина', en: 'Trash' },
  showcase: { uk: 'Вітрина', ru: 'Витрина', en: 'Showcase' },
  connect: { uk: 'Конектор', ru: 'Коннектор', en: 'Connector' },
  sources: { uk: 'Джерела', ru: 'Источники', en: 'Sources' },
  newResearch: { uk: '+ Нове дослідження', ru: '+ Новое исследование', en: '+ New research' },
  aiActions: { uk: 'Дії ШІ', ru: 'Действия ИИ', en: 'AI actions' },
  aiAskPlaceholder: { uk: 'Спитати цю базу…', ru: 'Спросить эту базу…', en: 'Ask this base…' },
  aiAskBtn: { uk: 'Запитати', ru: 'Спросить', en: 'Ask' },
  aiGaps: { uk: 'Знайти прогалини', ru: 'Найти пробелы', en: 'Find gaps' },
  aiSummary: { uk: 'Підсумок бази', ru: 'Сводка по базе', en: 'Summarize base' },
  aiNote: { uk: 'Відкриється твій Claude із запитом до цієї бази через конектор.', ru: 'Откроется твой Claude с запросом к этой базе через коннектор.', en: 'Opens your Claude with a connector prompt over this base.' },
  langTitle: { uk: 'Мова інтерфейсу', ru: 'Язык интерфейса', en: 'Interface language' },

  // base-picker.tsx
  pathAria: { uk: 'Шлях до бази', ru: 'Путь к базе', en: 'Base path' },
  chooseBase: { uk: 'Обрати базу даних', ru: 'Выбрать базу данных', en: 'Choose a database' },
  rootFolder: { uk: 'Папка', ru: 'Папка', en: 'Folder' },

  // create-base.tsx
  newBase: { uk: 'Нова база', ru: 'Новая база', en: 'New base' },
  fromScratch: { uk: 'з нуля або імпортом із таблиці', ru: 'с нуля или импортом из таблицы', en: 'from scratch or by importing a table' },
  baseName: { uk: 'Назва бази', ru: 'Название базы', en: 'Base name' },
  baseNamePlaceholder: { uk: 'Напр.: Інструменти для дизайну', ru: 'Напр.: Инструменты для дизайна', en: 'e.g. Design tools' },
  insideBase: { uk: 'Усередині бази (необов’язково)', ru: 'Внутри базы (необязательно)', en: 'Inside base (optional)' },
  columns: { uk: 'Колонки', ru: 'Колонки', en: 'Columns' },
  columnNamePlaceholder: { uk: 'Назва колонки', ru: 'Название колонки', en: 'Column name' },
  showFilterTitle: { uk: 'Показувати фільтр за цією колонкою', ru: 'Показывать фильтр по этой колонке', en: 'Show a filter for this column' },
  removeColumn: { uk: 'Прибрати колонку', ru: 'Убрать колонку', en: 'Remove column' },
  orPaste: { uk: 'або встав таблицю нижче (Ctrl+V з Google Sheets / Excel)', ru: 'или вставь таблицу ниже (Ctrl+V из Google Sheets / Excel)', en: 'or paste a table below (Ctrl+V from Google Sheets / Excel)' },
  cancel: { uk: 'Скасувати', ru: 'Отмена', en: 'Cancel' },
  creating: { uk: 'Створюю…', ru: 'Создаю…', en: 'Creating…' },
  create: { uk: 'Створити базу', ru: 'Создать базу', en: 'Create base' },
  createError: { uk: 'Помилка створення', ru: 'Ошибка создания', en: 'Creation error' },
  error: { uk: 'Помилка', ru: 'Ошибка', en: 'Error' },
  // column types (create-base form)
  typeText: { uk: 'Текст', ru: 'Текст', en: 'Text' },
  typeNumber: { uk: 'Число', ru: 'Число', en: 'Number' },
  typeSelect: { uk: 'Вибір', ru: 'Выбор', en: 'Select' },
  typeUrl: { uk: 'Посилання', ru: 'Ссылка', en: 'Link' },
  typeLongText: { uk: 'Довгий текст', ru: 'Длинный текст', en: 'Long text' },
  manualTab: { uk: 'Вручну', ru: 'Вручную', en: 'Manually' },
  importTab: { uk: 'Імпорт таблиці', ru: 'Импорт таблицы', en: 'Import a table' },
  topLevel: { uk: '— верхній рівень —', ru: '— верхний уровень —', en: '— top level —' },
  filterCheckbox: { uk: 'фільтр', ru: 'фильтр', en: 'filter' },
  addColumnBtn: { uk: '+ Колонка', ru: '+ Колонка', en: '+ Column' },
  uploadCsv: { uk: 'Завантажити CSV', ru: 'Загрузить CSV', en: 'Upload CSV' },
  columnsWord: { uk: 'колонок', ru: 'колонок', en: 'columns' },
  rowsWord: { uk: 'рядків', ru: 'строк', en: 'rows' },
  defaultColName: { uk: 'Назва', ru: 'Название', en: 'Name' },
  pasteExample: {
    uk: 'Назва\tКатегорія\tЦіна\nFigma\tUI\t15\nFramer\tUI\t30',
    ru: 'Название\tКатегория\tЦена\nFigma\tUI\t15\nFramer\tUI\t30',
    en: 'Name\tCategory\tPrice\nFigma\tUI\t15\nFramer\tUI\t30',
  },
} satisfies Record<string, Tri>;

const UI_FN = {
  goTo: { uk: (n: string) => `Перейти: ${n}`, ru: (n: string) => `Перейти: ${n}`, en: (n: string) => `Go to: ${n}` },
  showInside: {
    uk: (n: string) => `Показати, що всередині: ${n}`,
    ru: (n: string) => `Показать, что внутри: ${n}`,
    en: (n: string) => `Show what’s inside: ${n}`,
  },
  importN: {
    uk: (n: string) => `Імпортувати ${n} рядків`,
    ru: (n: string) => `Импортировать ${n} строк`,
    en: (n: string) => `Import ${n} rows`,
  },
  columnN: {
    uk: (n: string) => `Колонка ${n}`,
    ru: (n: string) => `Колонка ${n}`,
    en: (n: string) => `Column ${n}`,
  },
} satisfies Record<string, TriFn>;

export type UIKey = keyof typeof UI;
export function t(lang: Lang, key: UIKey): string {
  return UI[key][lang];
}
export function tGoTo(lang: Lang, name: string): string {
  return UI_FN.goTo[lang](name as never);
}
export function tShowInside(lang: Lang, name: string): string {
  return UI_FN.showInside[lang](name as never);
}
export function tImportN(lang: Lang, n: number): string {
  return UI_FN.importN[lang](String(n) as never);
}
export function tColumnN(lang: Lang, n: number): string {
  return UI_FN.columnN[lang](String(n) as never);
}

// ── надписи самой таблицы (пакет mindsheet) на выбранном языке ──────────────
export function mindsheetStrings(lang: Lang): MindSheetStrings {
  const T: Record<Lang, MindSheetStrings> = {
    uk: {
      searchPlaceholder: 'Пошук…', searchAria: 'Пошук', filterAll: 'Усі',
      filterAria: (l) => `Фільтр ${l}`, filtersHead: 'Фільтри',
      favoritesOnly: 'Тільки обране', addToFav: 'В обране', removeFromFav: 'Прибрати з обраного',
      reset: 'Скинути', clearSort: 'Прибрати сортування',
      shownOf: (s, t2) => `показано ${s} з ${t2}`, countRecords: (t2) => `${t2} записів`,
      viewButton: 'Вигляд', viewButtonTitle: 'Як показувати текст у клітинках', viewDialogAria: 'Вигляд таблиці',
      wrapHead: 'Текст не вліз у клітинку',
      wrapWrap: 'Переносити', wrapWrapHint: 'клітинка розтягується під весь обсяг тексту',
      wrapClip: 'Обрізати', wrapClipHint: 'один рядок, зайве зрізається по межі',
      wrapOverflow: 'За межу', wrapOverflowHint: 'текст заходить під сусідню клітинку, якщо вона порожня',
      wrapShrink: 'Стиснути', wrapShrinkHint: 'шрифт зменшується під ширину; що не влізло і у 8px — обрізається',
      rowHeightHead: 'Висота рядка', rowLinesAll: 'Всі',
      rowHeightNote: 'Висота працює лише з переносом — без нього рядок завжди один.',
      aggFold: 'Підсумки за групами', aggNote: 'Рахується по всій гілці, включно з вкладеними групами.',
      aggNone: '—', aggSum: 'сума', aggAvg: 'середнє', aggMin: 'мін', aggMax: 'макс', aggFilled: 'заповнено', aggUnique: 'унікальних',
      filledOf: (f, t2) => `${f} з ${t2}`,
      autoWidthLink: 'Повернути авто-ширину колонок', widthNote: 'Ширина колонки — тягни за межу заголовка.',
      sortHeaderTitle: 'Клік — сортувати; Shift + клік — додати рівень групування',
      colMenuAria: (l) => `Колонка ${l}`, rename: 'Перейменувати', typeHead: 'Тип',
      typeText: 'Текст', typeNumber: 'Число', typeSelect: 'Вибір', typeUrl: 'Посилання', typeLongText: 'Довгий текст',
      widthHead: 'Ширина', fitContent: 'За вмістом', fitAllContent: 'За вмістом', shrinkAllContent: 'Компактно', resetWidth: 'Скинути ширину', deleteColumn: 'Видалити колонку',
      deleteColumnConfirm: (l) => `Видалити колонку «${l}»? Її значення в рядках буде приховано.`,
      retypeNumberConfirm: (n) => `${n} значень не стануть числом — вони залишаться як є, але сортування й підсумки їх не врахують. Змінити тип?`,
      resizerAria: (l) => `Ширина колонки ${l}`, resizerTitle: 'Потягни, щоб змінити ширину колонки',
      addColNamePlaceholder: 'Назва', addColumnAria: 'Додати колонку', addRowTitle: 'Додати рядок', nothingFound: 'Нічого не знайдено', emptyTitle: 'Тут поки порожньо', emptyHint: 'Додайте перший рядок',
      expandAll: 'Розгорнути всі', collapseAll: 'Згорнути всі', expandGroup: 'Розгорнути', collapseGroup: 'Згорнути',
      dragRow: 'Перетягнути рядок', expandRecord: 'Розкрити запис', deleteRow: 'Видалити рядок',
      recordAria: 'Запис', close: 'Закрити', openAsPage: 'Відкрити сторінкою →',
      ok: 'ОК', groupingBy: (l, c) => `групування: ${l} · ${c}`, groupingHint: 'Shift + клік по заголовку — додати рівень',
      groupColorsLabel: 'Кольорові групи',
      freezeFirstLabel: 'Закріпити першу колонку',
      cellColorsLabel: 'Кольорові клітинки',
      clearFilter: 'Прибрати фільтр', filterByValue: (v) => `Фільтр: ${v}`,
    },
    ru: {
      searchPlaceholder: 'Поиск…', searchAria: 'Поиск', filterAll: 'Все',
      filterAria: (l) => `Фильтр ${l}`, filtersHead: 'Фильтры',
      favoritesOnly: 'Только избранные', addToFav: 'В избранное', removeFromFav: 'Убрать из избранного',
      reset: 'Сбросить', clearSort: 'Убрать сортировку',
      shownOf: (s, t2) => `показано ${s} из ${t2}`, countRecords: (t2) => `${t2} записей`,
      viewButton: 'Вид', viewButtonTitle: 'Как показывать текст в ячейках', viewDialogAria: 'Вид таблицы',
      wrapHead: 'Текст не влез в ячейку',
      wrapWrap: 'Переносить', wrapWrapHint: 'ячейка растягивается под весь объём текста',
      wrapClip: 'Обрезать', wrapClipHint: 'одна строка, лишнее срезается по границе',
      wrapOverflow: 'За границу', wrapOverflowHint: 'текст уходит под соседнюю ячейку, если она пустая',
      wrapShrink: 'Сжать', wrapShrinkHint: 'шрифт уменьшается под ширину; что не влезло и в 8px — обрезается',
      rowHeightHead: 'Высота строки', rowLinesAll: 'Всё',
      rowHeightNote: 'Высота работает только с переносом — без него строка всегда одна.',
      aggFold: 'Итоги по группам', aggNote: 'Считается по всей ветке, включая вложенные группы.',
      aggNone: '—', aggSum: 'сумма', aggAvg: 'среднее', aggMin: 'мин', aggMax: 'макс', aggFilled: 'заполнено', aggUnique: 'уникальных',
      filledOf: (f, t2) => `${f} из ${t2}`,
      autoWidthLink: 'Вернуть авто-ширину колонок', widthNote: 'Ширина колонки — тяни за границу заголовка.',
      sortHeaderTitle: 'Клик — сортировать; Shift + клик — добавить уровень группировки',
      colMenuAria: (l) => `Колонка ${l}`, rename: 'Переименовать', typeHead: 'Тип',
      typeText: 'Текст', typeNumber: 'Число', typeSelect: 'Выбор', typeUrl: 'Ссылка', typeLongText: 'Длинный текст',
      widthHead: 'Ширина', fitContent: 'По содержимому', fitAllContent: 'По содержимому', shrinkAllContent: 'Компактно', resetWidth: 'Сбросить ширину', deleteColumn: 'Удалить колонку',
      deleteColumnConfirm: (l) => `Удалить колонку «${l}»? Её значения из строк будут скрыты.`,
      retypeNumberConfirm: (n) => `${n} значений не станут числом — они останутся как есть, но сортировка и итоги их не учтут. Сменить тип?`,
      resizerAria: (l) => `Ширина колонки ${l}`, resizerTitle: 'Потяни, чтобы изменить ширину колонки',
      addColNamePlaceholder: 'Название', addColumnAria: 'Добавить колонку', addRowTitle: 'Добавить строку', nothingFound: 'Ничего не найдено', emptyTitle: 'Здесь пока пусто', emptyHint: 'Добавьте первую строку',
      expandAll: 'Развернуть все', collapseAll: 'Свернуть все', expandGroup: 'Развернуть', collapseGroup: 'Свернуть',
      dragRow: 'Перетащить строку', expandRecord: 'Раскрыть запись', deleteRow: 'Удалить строку',
      recordAria: 'Запись', close: 'Закрыть', openAsPage: 'Открыть страницей →',
      ok: 'ОК', groupingBy: (l, c) => `группировка: ${l} · ${c}`, groupingHint: 'Shift + клик по заголовку — добавить уровень',
      groupColorsLabel: 'Цветные группы',
      freezeFirstLabel: 'Закрепить первую колонку',
      cellColorsLabel: 'Цветные ячейки',
      clearFilter: 'Убрать фильтр', filterByValue: (v) => `Фильтр: ${v}`,
    },
    en: {
      searchPlaceholder: 'Search…', searchAria: 'Search', filterAll: 'All',
      filterAria: (l) => `Filter ${l}`, filtersHead: 'Filters',
      favoritesOnly: 'Favorites only', addToFav: 'Add to favorites', removeFromFav: 'Remove from favorites',
      reset: 'Reset', clearSort: 'Clear sorting',
      shownOf: (s, t2) => `${s} of ${t2} shown`, countRecords: (t2) => `${t2} records`,
      viewButton: 'View', viewButtonTitle: 'How cell text is shown', viewDialogAria: 'Table view',
      wrapHead: 'Text that overflows a cell',
      wrapWrap: 'Wrap', wrapWrapHint: 'the cell grows to fit all the text',
      wrapClip: 'Clip', wrapClipHint: 'one line, extra is cut at the edge',
      wrapOverflow: 'Overflow', wrapOverflowHint: 'text spills into the next cell if it is empty',
      wrapShrink: 'Shrink', wrapShrinkHint: 'font shrinks to fit; whatever won’t fit even at 8px is clipped',
      rowHeightHead: 'Row height', rowLinesAll: 'All',
      rowHeightNote: 'Height only works with wrapping — without it a row is always one line.',
      aggFold: 'Group totals', aggNote: 'Computed over the whole branch, including nested groups.',
      aggNone: '—', aggSum: 'sum', aggAvg: 'average', aggMin: 'min', aggMax: 'max', aggFilled: 'filled', aggUnique: 'unique',
      filledOf: (f, t2) => `${f} of ${t2}`,
      autoWidthLink: 'Reset column widths to auto', widthNote: 'Column width — drag the header border.',
      sortHeaderTitle: 'Click to sort; Shift + click to add a grouping level',
      colMenuAria: (l) => `Column ${l}`, rename: 'Rename', typeHead: 'Type',
      typeText: 'Text', typeNumber: 'Number', typeSelect: 'Select', typeUrl: 'Link', typeLongText: 'Long text',
      widthHead: 'Width', fitContent: 'Fit to content', fitAllContent: 'Fit to content', shrinkAllContent: 'Compact', resetWidth: 'Reset width', deleteColumn: 'Delete column',
      deleteColumnConfirm: (l) => `Delete column “${l}”? Its values in the rows will be hidden.`,
      retypeNumberConfirm: (n) => `${n} values won’t become numbers — they’ll stay as is, but sorting and totals will ignore them. Change the type?`,
      resizerAria: (l) => `Width of column ${l}`, resizerTitle: 'Drag to resize the column',
      addColNamePlaceholder: 'Name', addColumnAria: 'Add column', addRowTitle: 'Add row', nothingFound: 'Nothing found', emptyTitle: 'Nothing here yet', emptyHint: 'Add the first row',
      expandAll: 'Expand all', collapseAll: 'Collapse all', expandGroup: 'Expand', collapseGroup: 'Collapse',
      dragRow: 'Drag row', expandRecord: 'Expand record', deleteRow: 'Delete row',
      recordAria: 'Record', close: 'Close', openAsPage: 'Open as page →',
      ok: 'OK', groupingBy: (l, c) => `grouping: ${l} · ${c}`, groupingHint: 'Shift + click a header to add a level',
      groupColorsLabel: 'Coloured groups',
      freezeFirstLabel: 'Freeze first column',
      cellColorsLabel: 'Coloured cells',
      clearFilter: 'Clear filter', filterByValue: (v) => `Filter: ${v}`,
    },
  };
  return T[lang];
}
