# CBO Occupations (Classificacao Brasileira de Ocupacoes)

Global reference table with official MTE occupation data. Not scoped by organization.

## Business Rules

- Read-only reference data (no create/update/delete endpoints)
- ~2,694 occupations from MTE CBO 2002
- Seeded via migration SQL `0022_seed-cbo-occupations.sql` (idempotent upsert)
- Code format: `XXXX-XX` (e.g., `2124-05`)

## Endpoints

- `GET /v1/cbo-occupations?search=<term>&page=1&limit=20` — search by code or title (ILIKE), authenticated, no permissions
- `GET /v1/cbo-occupations/:id` — get by ID, authenticated, no permissions

## Search

- `search` param required (min 2 chars)
- Searches both `code` and `title` fields with ILIKE
- Returns paginated: `{ items, total, page, limit }`
