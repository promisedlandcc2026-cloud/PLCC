# API Domain Handlers

Finance and giving logic live here so [`api/_utils/core.ts`](../_utils/core.ts) stays a router.

Underscore-prefixed folders (`_handlers`, `_utils`) are **not** deployed as separate Vercel serverless functions (Hobby plan limit: 12).

| Module | Responsibility |
|--------|----------------|
| [`finance.ts`](./finance.ts) | Funds, ledger, counting, deposits, expenses, budgets, campaigns, pledges |
| [`giving.ts`](./giving.ts) | Giving transactions + insights; proxies `campaigns`/`pledges` to finance |

Shared auth: [`../_utils/auth.ts`](../_utils/auth.ts)  
Shared schemas: [`../_utils/schemas.ts`](../_utils/schemas.ts)

Entrypoints (count toward the function limit):
- [`../vault.ts`](../vault.ts) — main API (all `/api/*` except Servant Keeper)
- [`../servant-keeper.ts`](../servant-keeper.ts) — SK CSV import/export
