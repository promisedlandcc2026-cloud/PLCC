#!/usr/bin/env node
/**
 * Apply supabase/migrations/security_enable_rls_all_public_tables.sql
 *
 * Requires a Postgres connection string (DDL cannot run via the service-role JWT):
 *   DATABASE_URL='postgresql://postgres:...@db.yrpwdrioomdihjlmcfnu.supabase.co:5432/postgres' \
 *     node scripts/apply-rls-security-fix.mjs
 *
 * Get DATABASE_URL from: Supabase → Project Settings → Database → Connection string (URI)
 *
 * If DATABASE_URL is missing, prints the SQL path and exits 2 (manual SQL Editor apply).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = join(root, 'supabase/migrations/security_enable_rls_all_public_tables.sql');

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env) || !process.env[k]) process.env[k] = v;
  }
}

loadEnv(join(root, '.env.local'));
loadEnv(join(root, '.env.diagnostic.local'));

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  '';

if (!existsSync(sqlPath)) {
  console.error('Missing', sqlPath);
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');

if (!databaseUrl) {
  console.log(`
Cannot apply automatically — no DATABASE_URL in the environment.

To fix the CRITICAL "Table publicly accessible" alert:

1. Open Supabase → SQL Editor
2. Paste and Run the entire file:
   ${sqlPath}
3. Refresh Security Advisor — rls_disabled_in_public should clear

Or set DATABASE_URL (Database settings → Connection string) and re-run:
  DATABASE_URL='postgresql://...' node scripts/apply-rls-security-fix.mjs
`);
  process.exit(2);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  console.log('Applying RLS security fix…');
  const result = await client.query(sql);
  // Last statement may return tables still without RLS
  if (Array.isArray(result)) {
    const last = result[result.length - 1];
    if (last?.rows?.length) {
      console.log('Tables still without RLS:');
      for (const row of last.rows) console.log(' -', row.table_without_rls);
    } else {
      console.log('All public base tables now have RLS enabled.');
    }
  } else if (result?.rows?.length) {
    console.log('Tables still without RLS:');
    for (const row of result.rows) console.log(' -', row.table_without_rls);
  } else {
    console.log('RLS security fix applied.');
  }
} finally {
  await client.end();
}
