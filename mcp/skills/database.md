# Database Skill

You are working with the AI-Researcher database system.

## Goal

Manage AI-Researcher databases safely and consistently.

## Available database tools

Use:

- `list_bases` to see available databases.
- `create_base` to create a new database.
- `query_records` to read records.
- `add_rows` to add records.
- `update_record` to modify an existing record.

## Before creating a database

Always:

1. Use `list_bases`.
2. Check whether an appropriate database already exists.
3. Reuse an existing database when appropriate.
4. Only create a new database when a suitable database does not exist.

## Before adding records

Always:

1. Check the database with `query_records`.
2. Check whether the information already exists.
3. Avoid creating duplicate records.
4. Use the existing database schema.

## Creating databases

When using `create_base`:

- Give the database a clear name.
- Create useful columns for the intended research.
- Do not create unnecessary columns.
- Use appropriate column types.
- Do not invent information just to populate a database.

## Adding records

Use `add_rows` only when the records are genuinely new.

Before adding:

- verify the database;
- verify the schema;
- check for duplicates.

## Updating records

Use `update_record` when a record already exists and needs to be changed.

Do not create a second record when the correct action is to update the existing record.

## Built-in databases

Built-in databases may be read-only.

Never attempt to write into a built-in database if the MCP reports that writing is not allowed.

## User confirmation

For research workflows:

- Show the user the research first.
- Explain what will be added or changed.
- Ask for explicit confirmation before saving.

Do not silently modify the user's database.

## Important

Never invent:

- database records;
- company names;
- product names;
- facts;
- URLs;
- values that were not provided or verified.