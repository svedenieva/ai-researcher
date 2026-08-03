# ai-researcher-mcp

MCP-сервер для витрины **AI-Researcher**. Даёт агенту (Claude) инструменты
поверх той же базы Supabase, что и веб-приложение — без веб-авторизации,
напрямую сервис-ключом.

## Инструменты

| Инструмент | Что делает |
|---|---|
| `list_bases` | список баз (4 встроенных + пользовательские) |
| `create_base` | создать базу с колонками и (опц.) начальными строками |
| `add_rows` | добавить строки в пользовательскую базу |
| `query_records` | читать записи базы (с текстовым поиском) |
| `update_record` | обновить поля одной строки |
| `catalog_search` | поиск по каталогу продуктов (412), фильтр по разделу |
| `research_decompose` | разбить запрос на подтемы (Claude/OpenRouter или эвристика) |

## Установка

```bash
cd mcp && npm install
```

## Подключение (Claude Code / Claude Desktop)

Добавь в конфиг MCP. Пример для Claude Code (`.mcp.json` в проекте или
`~/.claude.json`):

```json
{
  "mcpServers": {
    "ai-researcher": {
      "command": "node",
      "args": ["C:/Users/nehoc/ai-researcher/mcp/server.mjs"],
      "env": {
        "SUPABASE_URL": "https://<твой-проект>.supabase.co",
        "SUPABASE_SERVICE_KEY": "<sb_secret_…>",
        "OPENROUTER_API_KEY": "<опционально, для умной декомпозиции>"
      }
    }
  }
}
```

`SUPABASE_URL` и `SUPABASE_SERVICE_KEY` — те же, что в `.env.local` витрины
(ключ формата `sb_secret_…`). `OPENROUTER_API_KEY` необязателен: без него
`research_decompose` использует эвристику.

## Проверка

```bash
node test-client.mjs
```
Подключается к серверу, выводит список инструментов и делает несколько
тестовых вызовов (создаёт тестовую базу — удали её потом, если не нужна).
