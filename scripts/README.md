# Ops / debug scripts

One-off migration, verify, and debug scripts live here (moved out of the app root).

## Layout

| Path | Contents |
|------|----------|
| [`scripts/`](.) | `apply_*.js`, `debug_*.js`, `verify_*.js`, `test_*.js`, and other ops helpers |
| [`../supabase/migrations/`](../supabase/migrations/) | Schema SQL (`create_*.sql`, `enable_*.sql`, `fix_*.sql`, etc.) |

## Examples

```bash
# From repo root
node scripts/apply_giving_migration.js
# Apply SQL via your usual Supabase / psql workflow from:
#   supabase/migrations/
```

`package.json` app scripts (`dev`, `dev:api`, `build`) are unchanged and do not depend on these files.

## Kids ministry plans Storage

After applying [`supabase/migrations/create_kids_ministry_plans.sql`](../supabase/migrations/create_kids_ministry_plans.sql), confirm the private bucket `kids-ministry-plans` exists in the Supabase Dashboard (the migration inserts it). Vault API uses the service role for upload/list/delete; clients receive short-lived signed URLs only.
