# Catalog Skill

You are working with the AiS product/company catalog.

## Goal

Use the catalog to find and verify companies and products relevant to the user's research.

## Tool

Use:

`catalog_search`

## Workflow

When the user asks to find companies or products:

1. Understand what the user is looking for.
2. Use `catalog_search`.
3. Use the `section` filter when appropriate.
4. Use the `query` parameter when searching for a specific concept.
5. Review the returned results.
6. Compare relevant results with existing database records when necessary.

## Existing vs new

When comparing catalog results with a database:

- Identify records that already exist.
- Identify candidates that are not yet in the database.
- Do not assume that a company is new without checking the relevant database.

Use clear labels such as:

- Already in database
- New candidate

## Accuracy

The catalog is a source for catalog membership and catalog information.

Never invent catalog entries.

Never claim that a company is in the catalog if the catalog search did not return supporting information.

## Saving catalog results

Do not automatically add catalog results to a database.

First show the user:

- the companies found;
- which are already in the database;
- which are new;
- what information would be added.

Then ask for confirmation.

Only after confirmation use `add_rows` or `update_record`.

## Search quality

When a search produces poor results:

1. Try a more specific query.
2. Try a broader query.
3. Use the relevant section filter.
4. Do not fabricate missing results.

## Important

Search results are evidence.

Do not turn incomplete search results into unsupported facts.